import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAvatar } from '@dicebear/core';
import {
  create as adventurerCreate,
  meta as adventurerMeta,
  schema as adventurerSchema,
} from '@dicebear/adventurer';
import type { Options as AdventurerOptions } from '@dicebear/adventurer';
import type { Options as CoreOptions } from '@dicebear/core';
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Compass,
  Gamepad2,
  Grid3X3,
  Heart,
  Home,
  Image as ImageIcon,
  MessageCircle,
  Pause,
  Play,
  Volume2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Share2,
  Sparkles,
  Trophy,
  User,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ai, auth, users, messages, games as gamesApi, likes as likesApi, savedGames as savedGamesApi, comments as commentsApi, getToken, setToken, resolveGameThumbnail } from './services/api';
import OrientationPicker from './components/OrientationPicker';
import PublishSheet from './components/PublishSheet';
import { BlogIndex, BlogPost } from './components/Blog';
import About from './components/About';
import { useDreamForge, FORGE_STEPS, forgePhaseLabel } from './hooks/useDreamForge';
import { isLandscape, type Orientation } from './constants/orientation';
// Still used by the search sheet and the feed caption — the backend no longer
// sends the old single `category` field, so those read `categories` instead.
import { CATEGORIES, categoryLabel } from './constants/categories';
import './App.css';

const FREESOUND_API_KEY = 'mgD2q6sEgb7r8seRdGqRVBgszcAgMqPAzGpHPAkk';

type DreamAttachment = {
  id: string;
  type: string;
  role: string;
  url: string;
  label: string;
  instruction: string;
  duration?: string;
};

type FreesoundTrack = {
  id: number;
  label: string;
  url: string;
  duration: string;
};

// Short, editable default — the user can rewrite it in the attachment's
// "how should this be used?" field. The url is sent separately, so it is not
// embedded here.
function buildBgmInstruction(_url?: string) {
  return 'Background music';
}

function buildHeroInstruction(_url?: string) {
  return 'The main character / focal sprite';
}

function attachmentUsagePlaceholder(type: string) {
  switch (type) {
    case 'video':
      return 'How should this be used? e.g. the background, a cutscene';
    case 'bgm':
      return 'e.g. main menu music, gameplay loop';
    case 'sfx':
      return 'e.g. jump sound, coin pickup';
    default:
      return 'How should this be used? e.g. the player, an enemy, a coin';
  }
}

async function fetchFreesoundTracks(type: 'bgm' | 'sfx', query = ''): Promise<FreesoundTrack[]> {
  const actualQuery = query.trim() || (type === 'bgm' ? 'game music loop' : 'game effect UI');
  const filter = type === 'bgm'
    ? '&filter=duration:[10.0 TO 300.0]'
    : '&filter=duration:[0.1 TO 15.0]';
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(actualQuery)}&token=${FREESOUND_API_KEY}${filter}&fields=id,name,previews,duration&page_size=20&page=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Freesound search failed (${response.status})`);
  const data = await response.json();
  return (data.results || []).map((item: any) => {
    const dur = Math.round(item.duration || 0);
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    return {
      id: item.id,
      label: item.name,
      url: item.previews?.['preview-hq-mp3'] || item.previews?.['preview-lq-mp3'] || '',
      duration: `${mins < 10 ? `0${mins}` : mins}:${secs < 10 ? `0${secs}` : secs}`,
    };
  }).filter((track: FreesoundTrack) => Boolean(track.url));
}

const API_URL = 'https://gametok-backend-267787411422.us-central1.run.app/api';
const API_ORIGIN = API_URL.replace(/\/api$/, '');
const GAMES_HOST = 'https://games.gametok.co';

// Google Sign-In (web). Uses the Firebase project's Web OAuth client
// (Firebase project "gametok-3a4c2", the same one the Android app uses —
// see google-services.json client_type 3). For GIS to work, this exact web
// origin must be listed under "Authorized JavaScript origins" for this OAuth
// client: Firebase Console -> Authentication -> Sign-in method -> Google ->
// Web SDK configuration -> (link to open it in Google Cloud Console).
// Override per-environment with VITE_GOOGLE_CLIENT_ID.
const GOOGLE_WEB_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  '516560435127-l6db4akjqei5q57j764kgu3aoaedu45l.apps.googleusercontent.com';

type AuthUser = {
  id: string;
  username: string | null;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  bio?: string | null;
  verified?: boolean;
  followingCount?: number;
  followersCount?: number;
  likesCount?: number;
};

declare global {
  interface Window {
    google?: any;
  }
}

let googleScriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

// Decode a Google ID token (JWT) payload — base64url, no verification (mirrors the
// mobile flow, where the backend trusts the client-supplied profile fields).
function decodeJwt(token: string): any {
  try {
    const payload = token.split('.')[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type Tab = 'home' | 'explore' | 'create' | 'connect' | 'profile' | 'more';

// ── Routing ───────────────────────────────────────────────────────────────────
// The shell's navigation state (which tab, which marketing page, whether the
// full-screen player is up) is DERIVED from the URL rather than held in state,
// so every surface has a real address that survives a reload and can be shared.
// Anything that used to call setActiveTab/setMarketingPage/setGameDeckMode now
// navigates instead.

const TAB_PATHS: Record<Tab, string> = {
  home: '/',
  explore: '/',
  create: '/create',
  connect: '/connect',
  profile: '/profile',
  more: '/more',
};

const MARKETING_PATHS: Record<MarketingPage, string> = {
  about: '/about',
  games: '/games',
  pricing: '/pricing',
  blog: '/blog',
  changelog: '/changelog',
  earn: '/earn',
  faq: '/faq',
  privacy: '/privacy',
  terms: '/terms',
};

type ParsedRoute = {
  tab: Tab;
  marketingPage: MarketingPage | null;
  /** Full-screen player (deck mode). */
  deck: boolean;
  /** Game id from /game/:id, when the URL names one. */
  gameId: string | null;
  /** Blog post slug from /blog/:slug. */
  postSlug: string | null;
};

function parseRoute(pathname: string, search: string = ''): ParsedRoute {
  const base: ParsedRoute = { tab: 'explore', marketingPage: null, deck: false, gameId: null, postSlug: null };
  // Tolerate a trailing slash so /explore/ and /explore are the same place.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const segments = path.split('/').filter(Boolean);
  const [head, second] = segments;

  const searchParams = new URLSearchParams(search);
  const queryGameId = searchParams.get('id') || searchParams.get('game');

  if (head === 'game' || head === 'game.html') {
    const gameId = second || queryGameId || null;
    return { ...base, deck: true, gameId };
  }

  if (queryGameId) {
    return { ...base, deck: true, gameId: queryGameId };
  }

  if (head === 'play') return { ...base, deck: true, gameId: second || null };
  if (head === 'blog') return { ...base, marketingPage: 'blog', postSlug: second || null };

  const marketingEntry = (Object.keys(MARKETING_PATHS) as MarketingPage[]).find(
    (page) => MARKETING_PATHS[page] === `/${head}`,
  );
  if (marketingEntry) return { ...base, marketingPage: marketingEntry };

  const tabEntry = (Object.keys(TAB_PATHS) as Tab[]).find((tab) => TAB_PATHS[tab] === `/${head}`);
  if (tabEntry) return { ...base, tab: tabEntry };

  // Unknown path or root — explore games
  return base;
}
type CreatePhase = 'idle' | 'refining' | 'generating' | 'preview';
type Modal = 'comments' | 'leaderboard' | 'share' | 'auth' | 'search' | 'notifications' | 'creator-profile' | 'message';
type MarketingFrame = 'site' | 'app';
type MarketingPage = 'about' | 'games' | 'pricing' | 'blog' | 'changelog' | 'earn' | 'faq' | 'privacy' | 'terms';
type AuthMode = 'signup' | 'login';

type Game = {
  id: string;
  creatorId?: string | null;
  userId?: string | null;
  createdBy?: string | null;
  name: string;
  title?: string;
  description?: string;
  embedUrl?: string;
  thumbnail?: string;
  previewVideoUrl?: string | null;
  plays?: number;
  likes?: number;
  saves?: number;
  commentsCount?: number;
  color?: string;
  /** Discovery categories (multi-label) from the game_categories join table. */
  categories?: string[];
  /** 'portrait' | 'landscape'. Landscape games are laid out 16:9, not squeezed into a 3:4 card. */
  orientation?: Orientation | null;
  createdAt?: string | null;
  creatorDisplayName?: string | null;
  creatorUsername?: string | null;
  creatorAvatar?: string | null;
  creatorVerified?: boolean;
};

type Creator = {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  verified?: boolean;
};


const PRICING_PLANS = [
  { name: 'Starter', price: '$0', audience: 'For players and first-time builders.', features: ['Play community games', 'Create starter drafts', 'Public sharing', 'GameTok avatar profile'] },
  { name: 'Creator', price: '$19', audience: 'For creators building often.', features: ['More monthly generations', 'Private drafts', 'Priority preview builds', 'Export-ready project history'] },
  { name: 'Studio', price: '$79', audience: 'For teams and serious game channels.', features: ['Team workspace', 'Higher generation limits', 'Early model access', 'Priority support'] },
];

const FAQ_GROUPS = [
  {
    title: 'General',
    items: [
      ['What is GameTok?', 'GameTok is an instant gaming platform where you can play games like GTA Lagos, create, and share with friends.'],
      ['Do I need to code?', 'No. The goal is to describe the game and let the system build a playable draft.'],
      ['Is the web app replacing mobile?', 'No. You can play directly on web and mobile in your browser or through the app.'],
    ],
  },
  {
    title: 'Creation',
    items: [
      ['Can I use images or audio?', 'The create flow already supports reference assets and audio attachments as part of the Dream Forge direction.'],
      ['Can I keep drafts?', 'Drafts are represented in the interface now; persistence should be wired to backend storage later.'],
      ['Who owns created games?', 'This needs a final policy pass before public launch. The current legal pages are placeholders.'],
    ],
  },
];

const CHANGELOG_ITEMS = [
  { date: 'June 2026', title: 'Cinematic web home', text: 'GameTok web now has a video-first public home with a prompt composer and proof strip.' },
  { date: 'June 2026', title: 'Hybrid Create direction', text: 'Desktop Create is moving toward a cinematic prompt workspace while mobile keeps the app-style Dream Forge.' },
  { date: 'June 2026', title: 'Google Sign-In web shell', text: 'Google Identity Services are wired on the frontend and ready for end-to-end OAuth verification.' },
];


/** Real accounts, lifted from the legacy about/ and more/ pages. */
const SOCIAL_LINKS: Array<{ label: string; url: string }> = [
  { label: 'X', url: 'https://x.com/thegametok' },
  { label: 'Instagram', url: 'https://instagram.com/gametok.co' },
  { label: 'TikTok', url: 'https://tiktok.com/@gametok.co' },
];

/** What the sidebar's More menu links to. */
const MORE_PAGES: Array<{ page: MarketingPage; label: string }> = [
  { page: 'about', label: 'About' },
  { page: 'blog', label: 'Blog' },
  { page: 'changelog', label: 'Changelog' },
  { page: 'games', label: 'Games' },
  { page: 'faq', label: 'FAQ' },
  { page: 'privacy', label: 'Privacy Policy' },
  { page: 'terms', label: 'Terms of Service' },
];


const GENRE_CHIPS = [
  'Platformer',
  'Puzzle',
  'Space',
  'Battle',
  'Sports',
  'Survival',
  'Racing',
  'Rhythm',
  'Horror',
  'Creative',
  'Quiz',
  'Builder',
];

const PROMPT_IDEAS = [
  'A neon ninja platformer with wall jumps, laser traps, and combo sparks',
  'A psychological horror quiz where each answer changes the room',
  'A basketball dunk contest game with physics-based throws',
  'A circular color-matching puzzle where tiles fall toward the center',
  'A lunar lander game with realistic fuel and jagged terrain',
  'A roleplay school mystery with choices, factions, and secret endings',
];

const STORAGE_KEYS = {
  activeGame: 'gametok-web-active-game',
  likedGames: 'gametok-web-liked-games',
  savedGames: 'gametok-web-saved-games',
  followedCreators: 'gametok-web-followed-creators',
  recentGames: 'gametok-web-recent-games',
  authUser: 'gametok-web-auth-user',
  cachedGames: 'gametok-web-cached-games',
};

// A brief typed into the home hero's composer, held across the hop to /create
// (and across the auth wall a signed-out visitor meets on the way).
const PENDING_BRIEF_KEY = 'gametok-web-pending-brief';


/** Reads and clears in one go, so the brief seeds the composer exactly once. */
const takePendingBrief = (): string => {
  try {
    const brief = sessionStorage.getItem(PENDING_BRIEF_KEY) || '';
    if (brief) sessionStorage.removeItem(PENDING_BRIEF_KEY);
    return brief;
  } catch {
    return '';
  }
};

const readRecentGameIds = (): string[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.recentGames) || '[]'); }
  catch { return []; }
};

const pushRecentGame = (id: string) => {
  const list = readRecentGameIds().filter((x) => x !== id);
  list.unshift(id);
  localStorage.setItem(STORAGE_KEYS.recentGames, JSON.stringify(list.slice(0, 30)));
};

const readStoredSet = (key: string) => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set<string>();
  }
};

const formatCount = (value?: number) => {
  const n = value || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${n}`;
};

const NRFC_COVER = 'https://pub-b7694276c8f54290854b276638a93b62.r2.dev/web-games/no-rules-fc/thumb.jpg';

export const GTA_LAGOS_GAME: Game = {
  id: 'gta-lagos',
  name: 'GTA Lagos',
  description: 'Open-world Lagos, from Ojota to Lekki. Hustle, drive, run missions with your crew, and play with everyone online.',
  color: '#1a1206',
  thumbnail: 'https://games.gametok.co/gta-lagos/thumb.jpg',
  embedUrl: 'https://games.gametok.co/gta-lagos/84fd1309389f/index.html',
  orientation: 'landscape',
  creatorDisplayName: 'GameTok',
  creatorUsername: 'gametok',
  creatorVerified: true,
  creatorAvatar: '/about/icon.png',
  plays: 0,
  likes: 0,
  saves: 0,
  status: 'published',
  version: '1.0.0',
} as Game;

const getThumbnailUrl = (game: Game) => {
  let value = game.thumbnail?.trim();
  if (value) {
    if (value.includes('r2.dev/web-games/')) {
      value = value.replace(/https?:\/\/[^/]+\.r2\.dev\/web-games\//, `${GAMES_HOST}/`);
    }
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    if (value.startsWith('/uploads/covers/') || value.startsWith('uploads/covers/')) {
      return `${API_ORIGIN}/${value.replace(/^\/+/, '')}`;
    }
    if (value.startsWith('/')) return value;
    if (value.startsWith('uploads/') || value.startsWith('covers/')) return `${API_ORIGIN}/${value}`;
    return `${GAMES_HOST}/${value.replace(/^\/+/, '')}`;
  }
  return '/app-assets/dream-forge-hero.png';
};

const handleThumbError = (e: React.SyntheticEvent<HTMLImageElement>, _game: Game) => {
  const fallback = '/app-assets/dream-forge-hero.png';
  if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
};


// The page's own ?… (an invite link: ?with=<player>&from=<name>) goes on to the game, which reads it.
const withPageQuery = (url: string) => {
  const q = new URLSearchParams(window.location.search); q.delete('gd_sdk_referrer_url');
  const extra = q.toString();
  return extra ? `${url}${url.includes('?') ? '&' : '?'}${extra}` : url;
};

const getGameUrl = (game: Game) => withPageQuery(gameFrameUrl(game));
const gameFrameUrl = (game: Game) => {
  if (game.id === 'gta-lagos') {
    return '/web-games/gta-lagos/live/index.html';
  }
  let raw = game.embedUrl;
  if (raw) {
    if (raw.includes('r2.dev/web-games/')) {
      raw = raw.replace(/https?:\/\/[^/]+\.r2\.dev\/web-games\//, '/web-games/');
    } else if (raw.startsWith('/api/')) {
      raw = `${API_ORIGIN}${raw}`;
    }
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}gd_sdk_referrer_url=${encodeURIComponent(GAMES_HOST)}`;
  }
  return `${GAMES_HOST}/${game.id}/?gd_sdk_referrer_url=${encodeURIComponent(GAMES_HOST)}`;
};

type DicebearConfig = {
  seed: string;
  bg: string;
  skinColor?: string;
  hairColor?: string;
  eyes?: string;
  eyebrows?: string;
  mouth?: string;
  hair?: string;
  accessory?: string;
  feature?: string;
  earrings?: string;
};

type DicebearOptions = Partial<AdventurerOptions & CoreOptions>;

const ADVENTURER_STYLE = {
  create: adventurerCreate,
  meta: adventurerMeta,
  schema: adventurerSchema,
};

const ADVENTURER_HAIR_VALID = new Set<string>([
  ...Array.from({ length: 26 }, (_, i) => `long${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 19 }, (_, i) => `short${String(i + 1).padStart(2, '0')}`),
]);

const DICEBEAR_BACKGROUNDS = ['1b1b1f', '20262f', '2c1f38', '1e2e27', '312419', '4a2338', '13343b', '4d3428'];
const DICEBEAR_SKIN_TONES = ['f2d3b1', 'eac393', 'd08b5b', '9c5a3c', '6b3d2a'];
const DICEBEAR_HAIR_COLORS = ['2c1b18', '5a3d2b', '8b5e3c', 'd19a66', 'f2d6b3', '8b1e3f', '4c6a92'];
const DICEBEAR_EYE_OPTIONS = Array.from({ length: 26 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const DICEBEAR_BROW_OPTIONS = Array.from({ length: 15 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const DICEBEAR_MOUTH_OPTIONS = Array.from({ length: 30 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);
const DICEBEAR_HAIR_OPTIONS = [
  ...Array.from({ length: 26 }, (_, i) => `long${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 19 }, (_, i) => `short${String(i + 1).padStart(2, '0')}`),
];
const DICEBEAR_ACCESSORY_OPTIONS = ['blank', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05'];
const DICEBEAR_FEATURE_OPTIONS = ['blank', 'mustache', 'blush', 'birthmark', 'freckles'];
const DICEBEAR_EARRING_OPTIONS = ['blank', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06'];

const avatarHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

const normalizeAvatarSeed = (seed?: string | null) => (seed || 'gametok').trim() || 'gametok';
const pickAvatarOption = (seed: string, options: string[], salt: string) => options[avatarHash(`${seed}:${salt}`) % options.length];
const sanitizeAdventurerHair = (hair?: string | null) => {
  const value = (hair || '').trim();
  if (value === 'bun01') return 'short07';
  if (value === 'bun02') return 'long08';
  if (!value || !ADVENTURER_HAIR_VALID.has(value)) return 'short01';
  return value;
};
const normalizeAccessory = (accessory?: string | null) => {
  if (accessory === 'glasses') return 'variant01';
  if (accessory === 'sunglasses') return 'variant02';
  return accessory || 'blank';
};

const buildDefaultAvatarConfig = (seed?: string | null): DicebearConfig => {
  const normalizedSeed = normalizeAvatarSeed(seed);
  return {
    seed: normalizedSeed,
    bg: DICEBEAR_BACKGROUNDS[avatarHash(normalizedSeed) % DICEBEAR_BACKGROUNDS.length],
    skinColor: pickAvatarOption(normalizedSeed, DICEBEAR_SKIN_TONES, 'skin'),
    hairColor: pickAvatarOption(normalizedSeed, DICEBEAR_HAIR_COLORS, 'hairColor'),
    eyes: pickAvatarOption(normalizedSeed, DICEBEAR_EYE_OPTIONS, 'eyes'),
    eyebrows: pickAvatarOption(normalizedSeed, DICEBEAR_BROW_OPTIONS, 'eyebrows'),
    mouth: pickAvatarOption(normalizedSeed, DICEBEAR_MOUTH_OPTIONS, 'mouth'),
    hair: pickAvatarOption(normalizedSeed, DICEBEAR_HAIR_OPTIONS, 'hair'),
    accessory: pickAvatarOption(normalizedSeed, DICEBEAR_ACCESSORY_OPTIONS, 'accessory'),
    feature: pickAvatarOption(normalizedSeed, DICEBEAR_FEATURE_OPTIONS, 'feature'),
    earrings: pickAvatarOption(normalizedSeed, DICEBEAR_EARRING_OPTIONS, 'earrings'),
  };
};

const getDicebearConfig = (uri?: string | null): DicebearConfig | null => {
  if (!uri) return null;
  let raw: string;
  if (uri.startsWith('dicebear://')) raw = uri.slice('dicebear://'.length);
  else if (uri.startsWith('avatar-creator://')) raw = uri.slice('avatar-creator://'.length);
  else return null;
  const [encodedSeed, query = ''] = raw.split('?');
  const seed = decodeURIComponent(encodedSeed || 'gametok');
  const params = new URLSearchParams(query);
  const defaults = buildDefaultAvatarConfig(seed);
  return {
    seed: normalizeAvatarSeed(seed),
    bg: params.get('bg') || defaults.bg,
    skinColor: params.get('skinColor') || defaults.skinColor,
    hairColor: params.get('hairColor') || defaults.hairColor,
    eyes: params.get('eyes') || defaults.eyes,
    eyebrows: params.get('eyebrows') || defaults.eyebrows,
    mouth: params.get('mouth') || defaults.mouth,
    hair: sanitizeAdventurerHair(params.get('hair') || defaults.hair),
    accessory: normalizeAccessory(params.get('accessory') || defaults.accessory),
    feature: params.get('feature') || defaults.feature,
    earrings: params.get('earrings') || defaults.earrings,
  };
};

const buildAdventurerOptions = (config: DicebearConfig, pixelSize: number): DicebearOptions => {
  const accessory = normalizeAccessory(config.accessory);
  const feature = config.feature || 'blank';
  const earrings = config.earrings || 'blank';
  const opts: DicebearOptions = {
    seed: config.seed,
    size: Math.min(256, Math.max(32, pixelSize)),
    radius: 50,
    backgroundColor: [config.bg],
    hairProbability: 100,
    hair: [sanitizeAdventurerHair(config.hair) as NonNullable<AdventurerOptions['hair']>[number]],
  };
  if (config.skinColor) opts.skinColor = [config.skinColor];
  if (config.hairColor) opts.hairColor = [config.hairColor];
  if (config.eyes) opts.eyes = [config.eyes as NonNullable<AdventurerOptions['eyes']>[number]];
  if (config.eyebrows) opts.eyebrows = [config.eyebrows as NonNullable<AdventurerOptions['eyebrows']>[number]];
  if (config.mouth) opts.mouth = [config.mouth as NonNullable<AdventurerOptions['mouth']>[number]];
  if (accessory !== 'blank') {
    opts.glasses = [accessory as NonNullable<AdventurerOptions['glasses']>[number]];
    opts.glassesProbability = 100;
  } else {
    opts.glassesProbability = 0;
  }
  if (feature !== 'blank') {
    opts.features = [feature as NonNullable<AdventurerOptions['features']>[number]];
    opts.featuresProbability = 100;
  } else {
    opts.featuresProbability = 0;
  }
  if (earrings !== 'blank') {
    opts.earrings = [earrings as NonNullable<AdventurerOptions['earrings']>[number]];
    opts.earringsProbability = 100;
  } else {
    opts.earringsProbability = 0;
  }
  return opts;
};

const avatarUrl = (seed?: string | null, uri?: string | null, size = 128) => {
  if (uri && !uri.startsWith('dicebear://') && !uri.startsWith('avatar-creator://')) {
    if (!uri.includes('unsplash.com')) return uri;
  }
  const config = getDicebearConfig(uri) || buildDefaultAvatarConfig(seed || uri || 'gametok');
  const svg = createAvatar(ADVENTURER_STYLE, buildAdventurerOptions(config, Math.min(256, Math.max(48, size)))).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Cloud save for games GameTok hosts (they load /cloud-save.js): a game asks for its save on start
// and reports its saved data as it changes; both go to the signed-in player's account. Like the
// player sessions below, the game is identified by its frame, never by what the message claims.
function useGameCloudSave() {
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || (data.type !== 'GAMETOK_SAVE_REQUEST' && data.type !== 'GAMETOK_SAVE')) return;
      const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-game-id]'))
        .find((f) => f.contentWindow === event.source);
      const gameId = frame?.dataset.gameId;
      if (!frame || !gameId || !frame.contentWindow) return;
      if (data.type === 'GAMETOK_SAVE') {
        if (data.storageData && typeof data.storageData === 'object') gamesApi.saveProgress(gameId, data.storageData);
        return;
      }
      const storageData = await gamesApi.loadProgress(gameId);
      frame.contentWindow.postMessage({ type: 'GAMETOK_SAVE_DATA', storageData }, event.origin && event.origin !== 'null' ? event.origin : '*');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}

// Count a play once per game start. The backend dedupes per client/user with a cooldown,
// and these plays are what the developer dashboard at games.gametok.co reports.
// Answers bridge.js GameTok.init()/session() for any game frame on the page. The frame is
// identified by event.source (never by what the message claims), and the reply goes only to
// that frame's origin.
function useGamePlayerSessions() {
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || data.type !== 'GAMETOK_PLAYER_SESSION_REQUEST') return;
      const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-game-id]'))
        .find((f) => f.contentWindow === event.source);
      if (!frame || !frame.contentWindow) return;
      const gameId = frame.dataset.gameId || '';
      const result: any = await gamesApi.playerSession(gameId);
      const reply = result.ok
        ? { type: 'GAMETOK_PLAYER_SESSION', requestId: data.requestId, ok: true, player: result.player, session: result.session, mode: result.mode, expiresIn: result.expiresIn }
        : { type: 'GAMETOK_PLAYER_SESSION', requestId: data.requestId, ok: false, code: result.code, error: result.error };
      frame.contentWindow.postMessage(reply, event.origin && event.origin !== 'null' ? event.origin : '*');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}

// Views, plays and time played, the same way as the app: a view when the game is shown, a play
// once it has been on screen and running for PLAY_AFTER_MS, then the seconds played reported
// every HEARTBEAT_MS and once more when it leaves (tab closed or hidden included).
const PLAY_AFTER_MS = 1800;
const HEARTBEAT_MS = 15000;
// The feed remounts on route changes (/play → /game/:id), so the same game showing again
// within VIEW_REPEAT_MS is the same view.
const VIEW_REPEAT_MS = 30000;
const lastViewAt = new Map<string, number>();
function useGameTracking(gameId: string | undefined, shown: boolean, playing: boolean) {
  useEffect(() => {
    if (!shown || !gameId) return;
    const now = Date.now();
    if (now - (lastViewAt.get(gameId) || 0) < VIEW_REPEAT_MS) return;
    lastViewAt.set(gameId, now);
    gamesApi.recordView(gameId);
  }, [gameId, shown]);

  useEffect(() => {
    if (!playing || !gameId) return;
    const startedAt = Date.now();
    let sessionId: string | null = null;
    let heartbeat: number | undefined;
    const seconds = () => Math.round((Date.now() - startedAt) / 1000);
    const report = (keepalive = false) => {
      if (sessionId) gamesApi.sessionTime(gameId, sessionId, seconds(), keepalive);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') report(true); };
    const startTimer = window.setTimeout(() => {
      gamesApi.recordPlay(gameId)
        .then((result: any) => {
          sessionId = result?.sessionId || null;
          if (!sessionId) return;
          heartbeat = window.setInterval(() => report(), HEARTBEAT_MS);
        })
        .catch(() => {});
    }, PLAY_AFTER_MS);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onHide);
      report(true);
    };
  }, [gameId, playing]);
}

async function request(endpoint: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': `web_${Date.now().toString(36)}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function useGameTokData(targetGameId?: string | null) {
  // No default game: the list is GameTok's real catalog (a /game/:id link adds its own game).
  const [games, setGames] = useState<Game[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [gamesRes, creatorsRes] = await Promise.allSettled([
          request('/games?limit=48&offset=0&sort=trending'),
          request('/users/recommended'),
        ]);
        if (!mounted) return;
        if (gamesRes.status === 'fulfilled' && Array.isArray(gamesRes.value?.games)) {
          // GTA Lagos plays from its own build address (games.gametok.co), not the R2 one the catalog has
          const incoming: Game[] = gamesRes.value.games.map((g: Game) => g.id !== 'gta-lagos' ? g : {
            ...g,
            thumbnail: g.thumbnail?.includes('r2.dev') ? 'https://games.gametok.co/gta-lagos/thumb.jpg' : (g.thumbnail || GTA_LAGOS_GAME.thumbnail),
            embedUrl: g.embedUrl?.includes('r2.dev') ? GTA_LAGOS_GAME.embedUrl : (g.embedUrl || GTA_LAGOS_GAME.embedUrl),
          });
          // keep a game a link already brought in (it may not be in the trending page)
          setGames((prev) => [...prev.filter((p) => !incoming.some((g) => g.id === p.id)), ...incoming]);
          try {
            localStorage.setItem(STORAGE_KEYS.cachedGames, JSON.stringify(incoming));
          } catch {}
          setOffline(false);
        } else {
          setOffline(true);
        }
        if (creatorsRes.status === 'fulfilled' && Array.isArray(creatorsRes.value?.users)) {
          setCreators(creatorsRes.value.users);
        }
      } catch {
        if (mounted) setOffline(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [targetGameId]);

  useEffect(() => {
    if (!games || games.length === 0) return;
    if (typeof Image === 'undefined') return;
    games.slice(0, 8).forEach((g) => {
      const url = getThumbnailUrl(g);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [games]);

  return { games, setGames, creators, loading, offline };
}

function extractIdSet(data: any, keys: string[]) {
  const set = new Set<string>();
  const add = (item: any) => {
    const id = typeof item === 'string'
      ? item
      : item?.id || item?.gameId || item?.userId || item?.creatorId || item?.username;
    if (id) set.add(String(id));
  };
  keys.forEach((key) => {
    const value = data?.[key];
    if (Array.isArray(value)) value.forEach(add);
  });
  if (Array.isArray(data)) data.forEach(add);
  return set;
}

function creatorIdFrom(creator: Creator | null) {
  return creator?.id || creator?.username || '';
}



function useIsMobile() {
  const query = '(max-width: 900px)';
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

function App() {
  useGamePlayerSessions();
  useGameCloudSave();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  // Navigation state comes from the URL — see parseRoute. Home hosts the
  // explore-style browse screen; the full-screen player (deck mode) lives at
  // /play, or /game/:id when a specific game was opened.
  const route = useMemo(() => parseRoute(location.pathname, location.search), [location.pathname, location.search]);
  const { tab: activeTab, marketingPage, deck: gameDeckMode, gameId: routeGameId, postSlug } = route;
  const { games, setGames, creators, loading } = useGameTokData(routeGameId);
  // Which frame the info pages wear. Arriving from More inside the app gives the
  // in-product layout; arriving from the public home gives the marketing site.
  const [marketingFrame, setMarketingFrame] = useState<MarketingFrame>('site');
  const [gameIndex, setGameIndex] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [likedGames, setLikedGames] = useState(() => readStoredSet(STORAGE_KEYS.likedGames));
  const [, setSavedGames] = useState(() => readStoredSet(STORAGE_KEYS.savedGames));
  const [followedCreators, setFollowedCreators] = useState(() => readStoredSet(STORAGE_KEYS.followedCreators));
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const token = getToken();
      if (!token) return null;
      const cached = localStorage.getItem(STORAGE_KEYS.authUser);
      if (cached) return JSON.parse(cached);
      return { id: 'restoring', username: 'Player', displayName: 'Player' };
    } catch {
      return null;
    }
  });
  const [commentsStore, setCommentsStore] = useState<Record<string, Array<{ id: string; username: string; text: string; likes: number; createdAt?: string }>>>(() => {
    try {
      return JSON.parse(localStorage.getItem('gametok_web_comments') || '{}');
    } catch {
      return {};
    }
  });

  const addComment = useCallback((gameId: string, text: string, username: string) => {
    const newComment = {
      id: `local-${Date.now()}`,
      username,
      text,
      likes: 0,
      createdAt: new Date().toISOString(),
    };
    setCommentsStore((prev) => {
      const updated = { ...prev, [gameId]: [newComment, ...(prev[gameId] || [])] };
      try {
        localStorage.setItem('gametok_web_comments', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);

  // Restore session from the shared backend token (same token the mobile app uses).
  useEffect(() => {
    if (!getToken()) return;
    let mounted = true;
    auth
      .me()
      .then((data: any) => {
        if (mounted && data?.user) {
          setAuthUser(data.user);
          try {
            localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(data.user));
          } catch {}
        }
      })
      .catch((err: any) => {
        // Only sign the user out when the token is actually rejected (401/403).
        // A transient network error / timeout must NOT wipe the session, or a
        // logged-in user gets bounced back to the login wall on reload.
        if (err?.status === 401 || err?.status === 403) {
          setToken(null);
          setAuthUser(null);
          try {
            localStorage.removeItem(STORAGE_KEYS.authUser);
          } catch {}
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthed = useCallback((user: AuthUser) => {
    setAuthUser(user);
    try {
      localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(user));
    } catch {}
    setModal(null);
    // Signing in mid-create must not throw away the work in progress.
    if (activeTab !== 'create') {
      navigate(TAB_PATHS.profile);
    }
  }, [activeTab, navigate]);


  useEffect(() => {
    if (!getToken() || games.length === 0) return;
    const gameIds = games.map((game) => game.id).filter(Boolean);
    let mounted = true;
    likesApi.check(gameIds)
      .then((data: any) => {
        if (!mounted) return;
        const ids = extractIdSet(data, ['likedGameIds', 'likedGames', 'likes', 'gameIds']);
        if (ids.size > 0 || Array.isArray(data?.likedGameIds) || Array.isArray(data?.likedGames)) setLikedGames(ids);
      })
      .catch(() => {});
    savedGamesApi.check(gameIds)
      .then((data: any) => {
        if (!mounted) return;
        const ids = extractIdSet(data, ['savedGameIds', 'savedGames', 'saves', 'gameIds']);
        if (ids.size > 0 || Array.isArray(data?.savedGameIds) || Array.isArray(data?.savedGames)) setSavedGames(ids);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [authUser?.id, games]);

  useEffect(() => {
    if (!authUser?.id) return;
    users.following(authUser.id)
      .then((data: any) => setFollowedCreators(extractIdSet(data, ['users', 'following', 'creators'])))
      .catch(() => {});
  }, [authUser?.id]);

  // A /game/:id link waits for that game instead of showing whatever loaded first (GTA Lagos flashed up).
  const [routeMissing, setRouteMissing] = useState<string | null>(null);
  const routeWaiting = !!routeGameId && routeMissing !== routeGameId && !games.some((g) => g.id?.toLowerCase() === routeGameId.toLowerCase());
  const activeGame = !routeWaiting && games.length > 0 ? games[((gameIndex % games.length) + games.length) % games.length] : null;

  const requireAuth = (mode: AuthMode = 'signup') => {
    if (authUser || getToken()) return false;
    openAuth(mode);
    return true;
  };

  const toggleBackendSet = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    id: string,
    requestToggle: () => Promise<any>,
  ) => {
    if (!id || requireAuth('login')) return;
    let shouldAdd = true;
    setter((previous) => {
      const next = new Set(previous);
      shouldAdd = !next.has(id);
      shouldAdd ? next.add(id) : next.delete(id);
      return next;
    });
    requestToggle().then((data: any) => {
      if (typeof data?.liked === 'boolean' || typeof data?.saved === 'boolean' || typeof data?.following === 'boolean') {
        const confirmed = Boolean(data.liked ?? data.saved ?? data.following);
        setter((previous) => {
          const next = new Set(previous);
          confirmed ? next.add(id) : next.delete(id);
          return next;
        });
      }
    }).catch(() => {
      setter((previous) => {
        const next = new Set(previous);
        shouldAdd ? next.delete(id) : next.add(id);
        return next;
      });
    });
  };

  const toggleActiveLike = () => {
    if (!activeGame) return;
    toggleBackendSet(setLikedGames, activeGame.id, () => likesApi.toggle(activeGame.id));
  };
  const toggleCreatorFollow = (creator: Creator | null) => {
    const id = creatorIdFrom(creator);
    if (!id) return;
    toggleBackendSet(setFollowedCreators, id, () => users.follow(id));
  };
  const openCreatorMessage = (creator: Creator | null) => {
    if (!creator) return;
    if (requireAuth('login')) return;
    setSelectedCreator(creator);
    setModal('message');
  };

  const openGame = (game: Game) => {
    const index = games.findIndex((item) => item.id === game.id);
    setGameIndex(index >= 0 ? index : 0);
    setModal(null);
    pushRecentGame(game.id);
    navigate(`/game/${game.id}`);
  };

  const goTab = (tab: Tab) => {
    // Creating a game requires an account; browsing/exploring does not.
    if (tab === 'create' && requireAuth('signup')) return;
    navigate(TAB_PATHS[tab]);
  };

  const goMarketingPage = (page: MarketingPage, frame: MarketingFrame = 'site') => {
    setMarketingFrame(frame);
    setModal(null);
    navigate(MARKETING_PATHS[page]);
  };

  const openAuth = (mode: AuthMode = 'signup') => {
    setAuthMode(mode);
    setModal('auth');
  };

  // A game asks for sign-in (GameTok.signIn() in bridge.js): open ours. Only a game frame on this
  // page may ask (matched by event.source).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'GAMETOK_SIGN_IN_REQUEST') return;
      const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-game-id]')).find((f) => f.contentWindow === event.source);
      if (!frame || authUser) return;
      openAuth('login');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });
  // Signed in or out: tell the game frames, so a game can pick up its new player
  useEffect(() => {
    document.querySelectorAll<HTMLIFrameElement>('iframe[data-game-id]').forEach((f) => { try { f.contentWindow?.postMessage({ type: 'GAMETOK_PLAYER_CHANGED' }, '*'); } catch (e) { /* the frame is gone */ } });
  }, [authUser?.id]);

  // Leave the player and go back to browsing.
  const closePlayer = () => {
    navigate(TAB_PATHS.explore);
  };

  const fetchingGameIdRef = useRef<string | null>(null);

  // A /game/:id deep link decides which game is showing.
  useEffect(() => {
    if (!routeGameId) return;

    if (games.length > 0) {
      const routeIndex = games.findIndex((game) => game.id === routeGameId || game.id?.toLowerCase() === routeGameId.toLowerCase());
      if (routeIndex >= 0) {
        if (gameIndex !== routeIndex) {
          setGameIndex(routeIndex);
        }
        return;
      }
    }

    if (fetchingGameIdRef.current !== routeGameId) {
      fetchingGameIdRef.current = routeGameId;
      // Game not in initial trending feed — fetch directly by ID and prepend to games
      request('/games/' + routeGameId).then((res: any) => {
        const game = res?.game;
        if (game && game.id) {
          setGames((prev) => [game, ...prev.filter((g) => g.id !== game.id)]);
          setGameIndex(0);
        } else setRouteMissing(routeGameId);
      }).catch((e) => {
        setRouteMissing(routeGameId);
        console.warn('[WebPlayer] Failed to fetch shared game by ID:', e);
      }).finally(() => {
        fetchingGameIdRef.current = null;
      });
    }
  }, [routeGameId, games, gameIndex]);

  // Restore the last-played game only when the URL isn't already naming one, or
  // the stored id would fight the deep link and win.
  useEffect(() => {
    if (routeGameId || games.length === 0) return;
    const storedGameId = localStorage.getItem(STORAGE_KEYS.activeGame);
    if (!storedGameId) return;
    const storedIndex = games.findIndex((game) => game.id === storedGameId);
    if (storedIndex >= 0) setGameIndex(storedIndex);
  }, [routeGameId, games]);

  useEffect(() => {
    if (activeGame?.id) localStorage.setItem(STORAGE_KEYS.activeGame, activeGame.id);
  }, [activeGame?.id]);


  return (
    <div className={`gametok-shell ${marketingPage && !isMobile ? 'marketing-mode' : ''} ${activeTab === 'create' && !marketingPage ? 'create-mode' : 'explore-mode'}`}>
      {/* Direct Game Player (Mobile & Desktop) */}
      {gameDeckMode && (
        activeGame ? (
          <DesktopDirectGamePlayer
            game={activeGame}
            onGoHome={closePlayer}
            onExplore={closePlayer}
            liked={likedGames.has(activeGame.id)}
            onToggleLike={toggleActiveLike}
            onOpenModal={setModal}
          />
        ) : (
          <section className="desktop-deck-pending">
            <DesktopAppSidebar activeTab="explore" user={authUser} onTab={goTab} onPage={(page) => goMarketingPage(page, 'app')} />
            <EmptyAppState
              loading={loading || routeWaiting}
              title="Game not found"
              text="That game may have been removed."
            />
          </section>
        )
      )}

      {/* Normal Website View (Mobile & Desktop) */}
      {!gameDeckMode && marketingPage && (
        <StaticMarketingPage
          frame={marketingFrame}
          page={marketingPage}
          postSlug={postSlug}
          games={games}
          onPage={(page) => goMarketingPage(page, marketingFrame)}
          onOpenPost={(slug) => navigate(slug ? `/blog/${slug}` : MARKETING_PATHS.blog)}
          onHome={closePlayer}
          onCreate={() => goTab('create')}
          onExplore={() => goTab('explore')}
          onOpenGame={openGame}
          onAuth={openAuth}
        />
      )}

      {!gameDeckMode && !marketingPage && activeTab === 'create' && (
        <section className="desktop-create-shell">
          <DesktopAppSidebar activeTab="create" user={authUser} onTab={goTab} onPage={(page) => goMarketingPage(page, 'app')} />
          <CreateScreen
            variant="desktop"
            onOpenGame={openGame}
            user={authUser}
            onAuthRequired={() => openAuth('signup')}
          />
        </section>
      )}

      {!gameDeckMode && !marketingPage && activeTab !== 'create' && (
        <DesktopExploreScreen
          user={authUser}
          games={games}
          onTab={goTab}
          onOpenGame={openGame}
          onCreate={() => goTab('create')}
          onPage={(page) => goMarketingPage(page, 'app')}
        />
      )}

      {modal && (
        <Sheet title={modalTitle(modal)} onClose={() => setModal(null)} variant={modal === 'auth' ? 'auth' : modal === 'message' ? 'message' : undefined}>
          {modal === 'comments' && activeGame && <CommentsSheet game={activeGame} creators={creators} commentsStore={commentsStore} onAddComment={addComment} user={authUser} />}
          {modal === 'leaderboard' && activeGame && <LeaderboardSheet game={activeGame} creators={creators} />}
          {modal === 'share' && activeGame && <ShareSheet game={activeGame} />}
          {modal === 'auth' && <AuthSheet initialMode={authMode} onAuthed={handleAuthed} onClose={() => setModal(null)} />}
          {modal === 'search' && <SearchSheet games={games} creators={creators} onOpenGame={openGame} onCreate={() => { setModal(null); goTab('create'); }} />}
          {modal === 'notifications' && <NotificationsSheet games={games} creators={creators} onOpenGame={openGame} />}
          {modal === 'creator-profile' && selectedCreator && (
            <CreatorProfileSheet
              creator={selectedCreator}
              games={games}
              following={followedCreators.has(creatorIdFrom(selectedCreator))}
              onOpenGame={openGame}
              onToggleFollow={() => toggleCreatorFollow(selectedCreator)}
              onMessage={() => openCreatorMessage(selectedCreator)}
            />
          )}
          {modal === 'message' && selectedCreator && <DirectMessageSheet creator={selectedCreator} />}
        </Sheet>
      )}
    </div>
  );
}

function modalTitle(modal: Modal) {
  if (modal === 'comments') return 'Comments';
  if (modal === 'leaderboard') return 'Scores';
  if (modal === 'share') return 'Share Game';
  if (modal === 'search') return 'Games';
  if (modal === 'notifications') return 'Notifications';
  if (modal === 'creator-profile') return 'Creator';
  if (modal === 'message') return 'Message';
  return 'Join GameTok';
}

function EmptyAppState({ loading, title, text }: { loading?: boolean; title: string; text: string }) {
  return (
    <section className="empty-app-state">
      {loading ? <RefreshCw className="spin" size={34} /> : <Gamepad2 size={34} />}
      <h2>{loading ? 'Loading games...' : title}</h2>
      <p>{loading ? 'Pulling the live GameTok feed from the backend.' : text}</p>
    </section>
  );
}

function EmptyListState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-list-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}






/**
 * Real drafts, from GET /ai/drafts. What was here before was a `useMemo` that
 * fabricated at most one entry out of whatever game the feed happened to be
 * showing, labelled it "Playable draft", and never called the endpoint.
 */
function DraftsPanel({ onBack }: { onBack: () => void }) {
  const [drafts, setDrafts] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // Drafts are per-account; without a token the endpoint answers "Auth failed",
    // which is true but not something to put in front of a signed-out visitor.
    if (!getToken()) {
      setDrafts([]);
      setError('Sign in to see your drafts.');
      return;
    }
    (async () => {
      try {
        const res: any = await ai.drafts();
        if (!mounted) return;
        setDrafts(Array.isArray(res) ? res : res?.drafts || []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Could not load your drafts.');
        setDrafts([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="drafts-panel">
      <div className="drafts-header">
        <h1>{drafts === null ? 'Drafts' : `${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}</h1>
        <button onClick={onBack}><Plus size={16} /> New game</button>
      </div>
      {drafts === null && <p className="drafts-empty">Loading your drafts…</p>}
      {error && <p className="drafts-empty">{error}</p>}
      {drafts !== null && drafts.length === 0 && !error && (
        <p className="drafts-empty">No drafts yet. Build something and it'll show up here.</p>
      )}
      <div className="draft-grid">
        {(drafts || []).map((draft) => (
          <button key={draft.id} onClick={onBack}>
            {draft.thumbnail && <img src={resolveGameThumbnail(draft.thumbnail, draft.id, draft)} alt="" />}
            <span>
              <strong>{draft.title || 'Untitled Dream'}</strong>
              <small>{draft.isDraft === false ? 'Published' : 'Draft'}</small>
            </span>
            <Play size={16} fill="currentColor" />
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateScreen({
  onOpenGame,
  user,
  onAuthRequired,
  variant = 'mobile',
}: {
  onOpenGame: (game: Game) => void;
  user: AuthUser | null;
  onAuthRequired: () => void;
  /**
   * Desktop uses this same Dream Forge surface, just laid out as a centered
   * column instead of a phone-shaped stage — it reads far better than the old
   * DesktopCreateWorkspace, so there is one create experience rather than two.
   */
  variant?: 'mobile' | 'desktop';
}) {
  const isDesktop = variant === 'desktop';
  const forge = useDreamForge();
  const [phase, setPhase] = useState<CreatePhase>('idle');
  const [studioTab, setStudioTab] = useState<'create' | 'drafts'>('create');
  // Same hand-off as the desktop workspace: a brief typed on the home hero seeds
  // the composer here rather than being lost on the way in.
  const [prompt, setPrompt] = useState(takePendingBrief);
  const [selectedIdea, setSelectedIdea] = useState(PROMPT_IDEAS[0]);
  // Required, and permanent — see OrientationPicker. Starts unset on purpose.
  const [orientation, setOrientation] = useState<Orientation | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [showTools, setShowTools] = useState(false);
  /** Refine can replace the preview without going back through the forge. */
  const [refinedHtml, setRefinedHtml] = useState<string | null>(null);
  const [refinedTitle, setRefinedTitle] = useState<string | null>(null);
  /** Attachment/upload complaints, kept apart from build failures. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachedAssets, setAttachedAssets] = useState<DreamAttachment[]>([]);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioTab, setAudioTab] = useState<'bgm' | 'sfx'>('bgm');
  const [audioQuery, setAudioQuery] = useState('');
  const [audioTracks, setAudioTracks] = useState<FreesoundTrack[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<FreesoundTrack | null>(null);
  const [previewingAudioId, setPreviewingAudioId] = useState<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const forgeDurationHint = useMemo(() => {
    const text = (prompt || selectedIdea).toLowerCase();
    const looksAssetHeavy = text.length > 350
      || /\b(many|multiple|several|dozen|traffic|character|enemy|enemies|vehicle|cars?|sprites?|lanes?|boss|weapon|level)\b/.test(text);
    if (!looksAssetHeavy) return null;
    return 'Detailed games with lots of characters, vehicles, or art usually take 15–25 minutes — most of that is AI art generation.';
  }, [prompt, selectedIdea]);
  const genreRows = useMemo(() => [
    GENRE_CHIPS.filter((_, index) => index % 3 === 0),
    GENRE_CHIPS.filter((_, index) => index % 3 === 1),
    GENRE_CHIPS.filter((_, index) => index % 3 === 2),
  ], []);
  const mediaTools = [
    { label: 'Images', icon: <ImageIcon size={26} />, tone: 'purple', action: () => imageInputRef.current?.click() },
    { label: 'Videos', icon: <Play size={26} />, tone: 'pink', action: () => videoInputRef.current?.click() },
    { label: 'Sounds', icon: <Volume2 size={26} />, tone: 'cyan', action: () => openAudioPicker('sfx') },
    { label: 'BGM', icon: <Volume2 size={26} />, tone: 'violet', action: () => openAudioPicker('bgm') },
    { label: 'Memes', icon: <Sparkles size={26} />, tone: 'rose', action: () => imageInputRef.current?.click() },
    { label: 'Feature', icon: <Zap size={26} />, tone: 'orange', action: () => setShowTools(true) },
  ];

  // The forge drives the screen: a resumed build (page reload mid-generation)
  // has to land on the generating view without the user re-triggering anything.
  useEffect(() => {
    if (forge.status === 'building') setPhase('generating');
    else if (forge.status === 'ready') setPhase('preview');
    else if (forge.status === 'error') setPhase('refining');
  }, [forge.status]);

  const launchBuild = () => {
    if (!orientation) return;
    const finalPrompt = (prompt || selectedIdea).trim();
    if (!finalPrompt) return;
    if (!user) {
      onAuthRequired();
      return;
    }
    forge.start({
      prompt: finalPrompt,
      orientation,
      attachments: attachedAssets.map(({ type, role, url, label, instruction, duration }) => ({
        type,
        role,
        url,
        label,
        title: label,
        instruction,
        duration,
      })),
    });
  };

  const start = () => {
    if (!prompt.trim()) setPrompt(selectedIdea);
    setPhase('refining');
  };

  const surprise = () => {
    const idea = PROMPT_IDEAS[Math.floor(Math.random() * PROMPT_IDEAS.length)];
    setSelectedIdea(idea);
    setPrompt(idea);
  };

  const addAttachment = (attachment: Omit<DreamAttachment, 'id'>) => {
    setAttachedAssets((assets) => [
      ...assets.filter((item) => item.url !== attachment.url),
      { ...attachment, id: `${attachment.type}-${Date.now()}` },
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachedAssets((assets) => assets.filter((item) => item.id !== id));
  };

  const updateAttachmentInstruction = (id: string, instruction: string) => {
    setAttachedAssets((assets) => assets.map((item) => (item.id === id ? { ...item, instruction } : item)));
  };

  const loadAudioTracks = async (type: 'bgm' | 'sfx' = audioTab, query = audioQuery) => {
    setAudioLoading(true);
    setAudioError(null);
    try {
      const tracks = await fetchFreesoundTracks(type, query);
      setAudioTracks(tracks);
      if (!tracks.some((track) => track.id === selectedAudioTrack?.id)) {
        setSelectedAudioTrack(tracks[0] || null);
      }
    } catch (error: any) {
      setAudioTracks([]);
      setSelectedAudioTrack(null);
      setAudioError(error?.message || 'Could not load audio library.');
    } finally {
      setAudioLoading(false);
    }
  };

  const openAudioPicker = (type: 'bgm' | 'sfx' = 'bgm') => {
    setAudioTab(type);
    setShowAudioModal(true);
    void loadAudioTracks(type, audioQuery);
  };

  const previewAudioTrack = (track: FreesoundTrack) => {
    if (!track.url) return;
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    const player = new Audio(track.url);
    audioPreviewRef.current = player;
    setPreviewingAudioId(track.id);
    player.onended = () => setPreviewingAudioId((current) => (current === track.id ? null : current));
    void player.play().catch(() => setPreviewingAudioId(null));
  };

  const confirmAudioSelection = () => {
    if (!selectedAudioTrack?.url) return;
    addAttachment({
      type: audioTab,
      role: audioTab,
      url: selectedAudioTrack.url,
      label: selectedAudioTrack.label,
      duration: selectedAudioTrack.duration,
      instruction: audioTab === 'bgm'
        ? buildBgmInstruction()
        : 'A triggered sound effect',
    });
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current = null;
    }
    setPreviewingAudioId(null);
    setShowAudioModal(false);
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!url) return;
      addAttachment({
        type: 'image',
        role: 'hero',
        url,
        label: file.name || 'Hero image',
        instruction: buildHeroInstruction(url),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setUploadError('That video is a bit large — keep clips under ~12MB so they load fast in the game.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!url) return;
      addAttachment({
        type: 'video',
        role: 'background',
        url,
        label: file.name || 'Background video',
        instruction: 'The looping background',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!url) return;
      addAttachment({
        type: audioTab,
        role: audioTab,
        url,
        label: file.name || (audioTab === 'bgm' ? 'BGM loop' : 'Sound effect'),
        instruction: audioTab === 'bgm'
          ? buildBgmInstruction()
          : 'A triggered sound effect',
      });
      setShowAudioModal(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className={`create-screen ${isDesktop ? 'is-desktop' : ''}`}>
      <div className="create-bg" />
      <header className="create-mobile-header">
        {studioTab === 'create' ? (
          <>
            <button className="create-avatar-button" onClick={() => setShowTools((value) => !value)}>
              <img src={avatarUrl(user?.username || 'guest-player', user?.avatar || null, 104)} alt="" />
            </button>
            {/* The sidebar already carries the wordmark on desktop. */}
            <strong>{isDesktop ? '' : 'gametok'}</strong>
            {/* Desktop hides the bottom tab bar, so Drafts needs a door here. */}
            {isDesktop ? (
              <button className="create-drafts-link" onClick={() => setStudioTab('drafts')}>
                <Gamepad2 size={16} /> Drafts
              </button>
            ) : (
              <span />
            )}
          </>
        ) : (
          <>
            <button className="header-menu-button" onClick={() => setStudioTab('create')}><ChevronLeft size={22} /></button>
            <strong>Your Drafts</strong>
            <span />
          </>
        )}
      </header>

      {studioTab === 'create' && phase === 'idle' && (
        <div className="create-idle create-scroll">
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
          <input ref={audioFileInputRef} type="file" accept="audio/*" hidden onChange={handleAudioUpload} />
          <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleVideoUpload} />

          <div className="create-hero-mobile">
            <h1><Sparkles size={24} /> <span>Dream Forge</span></h1>
            <p>Your imagination. Unlocked.</p>
          </div>

          <div className="mobile-input-card">
            <div className="input-glow-border" />
            <div className="input-card-header">
              <span><Zap size={12} /> GAME BRIEF</span>
            </div>

            {attachedAssets.length > 0 && (
              <div className="attached-visual-row">
                {attachedAssets.map((asset, index) => (
                  <div
                    key={asset.id}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 8 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {asset.type === 'image'
                        ? <img src={asset.url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
                        : asset.type === 'video' ? <Play size={18} /> : <Volume2 size={18} />}
                      <strong style={{ fontSize: 12 }}>#{index + 1}</strong>
                      <button
                        type="button"
                        onClick={() => removeAttachment(asset.id)}
                        aria-label="Remove"
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={asset.instruction}
                      onChange={(event) => updateAttachmentInstruction(asset.id, event.target.value)}
                      placeholder={attachmentUsagePlaceholder(asset.type)}
                      style={{ fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: 'inherit', width: '100%' }}
                    />
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Make a first person drifting game with night neon roads..."
              rows={4}
            />
            {!prompt.trim() && <p>Write a brief or tap Surprise me to seed one.</p>}

            <OrientationPicker value={orientation} onChange={setOrientation} />

            <div className="input-bottom-row">
              <button className="surprise-button" type="button" onClick={surprise}><Sparkles size={16} /> Surprise me</button>
              <button className={`forge-button ${!prompt.trim() ? 'idle' : ''}`} type="button" onClick={start}>
                Forge It <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="media-tool-row">
            {mediaTools.map((tool) => (
              <button key={tool.label} className={`media-tool ${tool.tone}`} type="button" onClick={tool.action}>
                <span>{tool.icon}</span>
                {tool.label}
              </button>
            ))}
          </div>

          <div className="starter-rail-header">
            <p>Fast templates for mechanics-heavy prompts.</p>
          </div>
          {/* Mobile runs three marquee lanes, each chip duplicated so the row can
              scroll forever. Desktop has the width to show every genre at once, and
              the duplication would read as a bug there — so it wraps instead. */}
          {isDesktop ? (
            <div className="desktop-idea-grid">
              {GENRE_CHIPS.map((chip, index) => (
                <button key={chip} type="button" onClick={() => {
                  const idea = PROMPT_IDEAS[(GENRE_CHIPS.indexOf(chip) + index) % PROMPT_IDEAS.length];
                  setSelectedIdea(idea);
                  setPrompt(idea);
                }}>
                  <Sparkles size={15} />
                  {chip}
                </button>
              ))}
            </div>
          ) : (
            <div className="mobile-idea-lanes">
              {genreRows.map((row, rowIndex) => (
                <div className="mobile-idea-row" key={`genre-row-${rowIndex}`}>
                  {[...row, ...row].map((chip, index) => (
                    <button key={`${chip}-${index}`} type="button" onClick={() => {
                      const idea = PROMPT_IDEAS[(GENRE_CHIPS.indexOf(chip) + index) % PROMPT_IDEAS.length];
                      setSelectedIdea(idea);
                      setPrompt(idea);
                    }}>
                      <Sparkles size={15} />
                      {chip}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {(forge.error || uploadError) && (
            <div className="create-error-box">
              <span>{forge.error || uploadError}</span>
              {forge.error && forge.retryable && (
                <button className="retry" onClick={forge.retry}><RefreshCw size={14} /> Retry</button>
              )}
              <button onClick={() => { setUploadError(null); forge.reset(); }}><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      {studioTab === 'drafts' && <DraftsPanel onBack={() => setStudioTab('create')} />}

      {(phase === 'idle' || studioTab === 'drafts') && (
        <div className="create-bottom-tabs">
          <button className={studioTab === 'create' ? 'active' : ''} onClick={() => setStudioTab('create')}>
            <Home size={20} /> <span>Home</span>
          </button>
          <button className={studioTab === 'drafts' ? 'active' : ''} onClick={() => setStudioTab('drafts')}>
            <Gamepad2 size={20} /> <span>Drafts</span>
          </button>
        </div>
      )}

      {studioTab === 'create' && phase === 'refining' && (
        <div className="refine-panel">
          <div className="ai-bubble">
            <Sparkles size={18} />
            <p>I can build this. I’ll make the core loop tight, give it responsive controls, and add visual feedback for every important action.</p>
          </div>
          <div className="spec-card">
            <h3>{prompt || selectedIdea}</h3>
            <ul>
              <li>Instant playable HTML game draft</li>
              <li>Mobile controls and desktop keyboard support</li>
              <li>Score loop, feedback, polish, and publish flow</li>
            </ul>
          </div>
          <OrientationPicker value={orientation} onChange={setOrientation} className="on-refine" />
          <div className="refine-actions">
            <button onClick={() => setPhase('idle')}>Edit Wish</button>
            <button className="primary" disabled={!orientation} onClick={launchBuild}>
              <Zap size={16} /> Build Game
            </button>
          </div>
          {forgeDurationHint && <p className="forge-duration-hint">{forgeDurationHint}</p>}
          {forge.error && (
            <div className="create-error-box">
              <span>{forge.error}</span>
              {forge.retryable && (
                <button className="retry" onClick={forge.retry}><RefreshCw size={14} /> Retry</button>
              )}
            </div>
          )}
        </div>
      )}

      {studioTab === 'create' && phase === 'generating' && (
        <div className="generating-panel">
          <div className="forge-loader">
            <RefreshCw className="spin" size={44} />
          </div>
          <h1>{forge.resuming ? 'Reconnecting to your build…' : 'Forging your game…'}</h1>
          <p className="forge-live-status">{forge.message || forgePhaseLabel(forge.phase)}</p>
          {forge.queue.ahead != null && forge.queue.ahead > 0 && (
            <p className="forge-queue">
              {forge.queue.ahead} {forge.queue.ahead === 1 ? 'build' : 'builds'} ahead of yours
              {forge.queue.running ? ` · ${forge.queue.running} running now` : ''}
            </p>
          )}
          <div className="progress-track"><span style={{ width: `${Math.min(100, forge.progress)}%` }} /></div>
          <p className="forge-live-phase">{Math.round(forge.progress)}%</p>
          <div className="step-list">
            {FORGE_STEPS.map((step, index) => (
              <span key={step.label} className={index <= forge.activeStep ? 'done' : ''}>{step.label}</span>
            ))}
          </div>
          {forgeDurationHint && <p className="forge-duration-hint">{forgeDurationHint}</p>}
          <button className="forge-cancel" onClick={forge.cancel}>Cancel build</button>
        </div>
      )}

      {studioTab === 'create' && phase === 'preview' && (
        <div className={`preview-panel ${isDesktop && forge.result?.draftId ? 'has-refine' : ''}`}>
          <div className="preview-toolbar">
            <button onClick={() => setShowTools((value) => !value)}><Wand2 size={16} /> Modify</button>
          </div>
          <div className={`preview-game ${isLandscape(forge.result?.orientation) ? 'is-landscape' : ''}`}>
            <iframe
              title="Preview game"
              // Sandboxed: this is model-written code running against the creator's
              // own session. allow-same-origin is needed for the game's storage.
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              srcDoc={refinedHtml || forge.result?.previewHtml || undefined}
            />
          </div>

          {/* The conversational edit loop, carried over from the old desktop
              workspace — it was the one thing that surface did better. */}
          {isDesktop && forge.result?.draftId && (
            <DesktopRefinePanel
              draftId={forge.result.draftId}
              gameTitle={refinedTitle || forge.result.title}
              currentSummary={prompt || selectedIdea}
              onApplied={(result) => {
                if (result?.htmlPreview) setRefinedHtml(result.htmlPreview);
                if (result?.title || result?.name) setRefinedTitle(result.title || result.name);
              }}
            />
          )}

          <div className="publish-bar">
            <button onClick={() => { setRefinedHtml(null); setRefinedTitle(null); forge.reset(); setPhase('idle'); }}>Keep Editing</button>
            <button
              className="primary"
              disabled={!forge.result?.draftId}
              onClick={() => setShowPublish(true)}
            >
              <Play size={16} fill="currentColor" /> Publish
            </button>
          </div>
        </div>
      )}

      {showPublish && forge.result && (
        <PublishSheet
          draftId={forge.result.draftId}
          defaultTitle={refinedTitle || forge.result.title}
          html={refinedHtml || forge.result.previewHtml}
          onClose={() => setShowPublish(false)}
          onPublished={(game) => {
            setShowPublish(false);
            setRefinedHtml(null);
            setRefinedTitle(null);
            forge.reset();
            setPhase('idle');
            if (game.id) onOpenGame({ id: game.id, name: game.name || 'New game' } as Game);
          }}
        />
      )}

      {showTools && (
        <aside className="tool-drawer">
          <h3>Creation tools</h3>
          {['Colors', 'Sounds', 'Features', 'Community assets', 'Game config'].map((tool) => (
            <button key={tool} type="button" onClick={() => {
              if (tool === 'Sounds') openAudioPicker('bgm');
            }}>{tool}<ChevronRight size={16} /></button>
          ))}
        </aside>
      )}

      {showAudioModal && (
        <div className="audio-modal-overlay" onClick={() => setShowAudioModal(false)}>
          <div className="audio-modal" onClick={(event) => event.stopPropagation()}>
            <div className="audio-modal-header">
              <div>
                <p>Attach audio</p>
                <h3>{audioTab === 'bgm' ? 'Background music' : 'Sound effect'}</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowAudioModal(false)}><X size={18} /></button>
            </div>

            <div className="audio-tab-row">
              <button type="button" className={audioTab === 'bgm' ? 'active' : ''} onClick={() => {
                setAudioTab('bgm');
                void loadAudioTracks('bgm', audioQuery);
              }}>BGM</button>
              <button type="button" className={audioTab === 'sfx' ? 'active' : ''} onClick={() => {
                setAudioTab('sfx');
                void loadAudioTracks('sfx', audioQuery);
              }}>SFX</button>
            </div>

            <form
              className="audio-search-row"
              onSubmit={(event) => {
                event.preventDefault();
                void loadAudioTracks(audioTab, audioQuery);
              }}
            >
              <input
                value={audioQuery}
                onChange={(event) => setAudioQuery(event.target.value)}
                placeholder={audioTab === 'bgm' ? 'Search game music loops...' : 'Search sound effects...'}
              />
              <button type="submit">Search</button>
            </form>

            <div className="audio-track-list">
              {audioLoading && <p className="audio-modal-status">Loading tracks...</p>}
              {!audioLoading && audioError && <p className="audio-modal-status error">{audioError}</p>}
              {!audioLoading && !audioError && audioTracks.length === 0 && (
                <p className="audio-modal-status">No tracks found. Try another search.</p>
              )}
              {!audioLoading && audioTracks.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  className={`audio-track-row${selectedAudioTrack?.id === track.id ? ' selected' : ''}`}
                  onClick={() => setSelectedAudioTrack(track)}
                >
                  <span>
                    <strong>{track.label}</strong>
                    <small>{track.duration}</small>
                  </span>
                  <span className="audio-track-actions">
                    <button
                      type="button"
                      className="audio-preview-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        previewAudioTrack(track);
                      }}
                    >
                      {previewingAudioId === track.id ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </span>
                </button>
              ))}
            </div>

            <div className="audio-modal-actions">
              <button type="button" onClick={() => audioFileInputRef.current?.click()}>Upload file</button>
              <button type="button" className="primary" disabled={!selectedAudioTrack} onClick={confirmAudioSelection}>
                Attach {audioTab === 'bgm' ? 'BGM' : 'SFX'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DesktopDirectGamePlayer({
  game,
  onGoHome: _onGoHome,
  onExplore: _onExplore,
  liked: _liked,
  onToggleLike: _onToggleLike,
  onOpenModal: _onOpenModal,
}: {
  game: Game;
  onGoHome?: () => void;
  onExplore: () => void;
  liked?: boolean;
  onToggleLike?: () => void;
  onOpenModal?: (modal: Modal) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useGameTracking(game.id, true, true);

  return (
    <div className="desktop-direct-player" ref={containerRef}>
      <main className="direct-player-body">
        <iframe
          className="direct-player-iframe"
          title={game.name}
          src={getGameUrl(game)}
          data-game-id={game.id}
          allow="autoplay; fullscreen; clipboard-write; cross-origin-isolated; microphone"
        />
      </main>
    </div>
  );
}

/** Nav shown on the marketing site. `active` gets the filled pill. */
const MARKETING_NAV: Array<{ page: MarketingPage; label: string }> = [
  { page: 'about', label: 'About' },
  { page: 'blog', label: 'Blog' },
  { page: 'games', label: 'Games' },
  { page: 'changelog', label: 'Changelog' },
  { page: 'faq', label: 'FAQ' },
];

function MarketingTopbar({
  active,
  onHome,
  onPage,
  onExplore,
}: {
  active: MarketingPage;
  onHome: () => void;
  onPage: (page: MarketingPage) => void;
  onExplore: () => void;
}) {
  return (
    <header className="marketing-topbar">
      <button className="desktop-wordmark" onClick={onHome}>
        <img src="/app-assets/icon.png" alt="" />
        <strong>GameTok</strong>
      </button>
      <nav className="marketing-nav">
        {MARKETING_NAV.map((item) => (
          <button
            key={item.page}
            className={active === item.page ? 'is-active' : ''}
            onClick={() => onPage(item.page)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {/* Into the feed, not the composer — you play first, then create. */}
      <button className="marketing-cta" onClick={onExplore}>
        Play &amp; Create <ChevronRight size={15} />
      </button>
    </header>
  );
}

function MarketingFooter({ onPage, onCreate }: { onPage: (page: MarketingPage) => void; onCreate: () => void }) {
  return (
    <footer className="marketing-footer">
      <div>
        <img src="/app-assets/icon.png" alt="" />
        <strong>GameTok</strong>
        <span>Playable social gaming.</span>
      </div>
      <nav>
        <button onClick={() => onPage('about')}>About</button>
        <button onClick={() => onPage('blog')}>Blog</button>
        <button onClick={() => onPage('changelog')}>Changelog</button>
        <button onClick={() => onPage('faq')}>FAQ</button>
        <button onClick={() => onPage('privacy')}>Privacy Policy</button>
        <button onClick={() => onPage('terms')}>Terms of Service</button>
      </nav>
      <button onClick={onCreate}>Make a game now</button>
    </footer>
  );
}

/**
 * The page body, with no chrome around it. Lifted out so the same content can
 * render inside either shell — the marketing site for signed-out visitors, and
 * the app shell (sidebar, no marketing topbar or footer) for anyone who opened
 * it from inside GameTok via More. Same content, different frame.
 */
function MarketingPageBody({
  page,
  postSlug,
  games,
  onCreate,
  onExplore,
  onOpenGame,
  onOpenPost,
}: {
  page: MarketingPage;
  postSlug: string | null;
  games: Game[];
  onCreate: () => void;
  onExplore: () => void;
  onOpenGame: (game: Game) => void;
  onOpenPost: (slug: string | null) => void;
}) {
  return (
    <>
      {/* Starting scaffold — copy is yours to direct. Structured as sections so
          each one can be rewritten independently. */}
      {page === 'about' && (
        <About
          variant="app"
          games={games}
          onCreate={onCreate}
          onExplore={onExplore}
          onThumbError={handleThumbError}
        />
      )}

      {page === 'games' && (
        <section className="marketing-grid-section">
          <div className="marketing-section-head">
            <h2>Playable community worlds</h2>
            <p>Explore trending games, interactive experiences, and instant worlds created on GameTok.</p>
          </div>
          <div className="marketing-game-grid">
            {games.slice(0, 18).map((game) => (
              <button key={game.id} onClick={() => onOpenGame(game)}>
                <img src={getThumbnailUrl(game)} alt="" onError={e => handleThumbError(e, game)} />
                <span>
                  <strong>{game.name}</strong>
                  <small>@{game.creatorDisplayName || game.creatorUsername || 'creator'} · {formatCount(game.plays)} plays</small>
                </span>
                <Play size={18} fill="currentColor" />
              </button>
            ))}
          </div>
        </section>
      )}

      {page === 'pricing' && (
        <section className="marketing-pricing">
          {PRICING_PLANS.map((plan, index) => (
            <article key={plan.name} className={index === 1 ? 'featured' : ''}>
              <span>{index === 1 ? 'Most useful' : 'GameTok'}</span>
              <h2>{plan.name}</h2>
              <p>{plan.audience}</p>
              <strong>{plan.price}<small>/mo</small></strong>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              <button onClick={onCreate}>Start building</button>
            </article>
          ))}
        </section>
      )}

      {page === 'blog' && (
        postSlug
          ? <BlogPost slug={postSlug} onBack={() => onOpenPost(null)} />
          : <BlogIndex onOpenPost={onOpenPost} />
      )}

      {page === 'changelog' && (
        <section className="timeline-list">
          {CHANGELOG_ITEMS.map((item) => (
            <article key={item.title}>
              <span>{item.date}</span>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </article>
          ))}
        </section>
      )}

      {page === 'earn' && (
        <section className="earn-layout">
          <article>
            <h2>Creator growth loop</h2>
            <p>GameTok should eventually reward the creators whose playable posts bring attention back to the platform. This v1 page explains the direction without wiring payments yet.</p>
            <div className="earn-steps">
              {['Create a playable game', 'Share gameplay clips', 'Bring players into GameTok'].map((step, index) => (
                <span key={step}><strong>{index + 1}</strong>{step}</span>
              ))}
            </div>
          </article>
          <aside>
            <span>Placeholder model</span>
            <strong>30,000+</strong>
            <p>AI game builders shaping the playable social feed.</p>
          </aside>
        </section>
      )}

      {page === 'faq' && (
        <section className="faq-list">
          {FAQ_GROUPS.map((group) => (
            <article key={group.title}>
              <h2>{group.title}</h2>
              {group.items.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </article>
          ))}
        </section>
      )}

      {(page === 'privacy' || page === 'terms') && (
        <article className="legal-copy">
          <h2>{page === 'privacy' ? 'Privacy placeholder' : 'Terms placeholder'}</h2>
          <p>This page is a static v1 placeholder and needs final legal review before public launch.</p>
          <p>GameTok should clearly explain account data, generated game content, uploads, analytics, ownership, moderation, and creator rights before production release.</p>
        </article>
      )}

    </>
  );
}

/** The public-site topbar, as it was before: plain nav plus log in / sign up. */
function MarketingSiteTopbar({
  onHome,
  onPage,
  onCreate,
  onAuth,
}: {
  onHome: () => void;
  onPage: (page: MarketingPage) => void;
  onCreate: () => void;
  onAuth: (mode?: AuthMode) => void;
}) {
  return (
    <header className="marketing-topbar">
      <button className="desktop-wordmark" onClick={onHome}>
        <img src="/app-assets/icon.png" alt="" />
        <strong>GameTok</strong>
      </button>
      <nav>
        <button onClick={() => onPage('games')}>Games</button>
        <button onClick={() => onPage('about')}>About</button>
        <button onClick={() => onPage('blog')}>Blog</button>
        <button onClick={onCreate}>Create</button>
      </nav>
      <div className="desktop-auth-actions">
        <button onClick={() => onAuth('login')}>Log in</button>
        <button onClick={() => onAuth('signup')}>Sign up</button>
      </div>
    </header>
  );
}

function StaticMarketingPage({
  page,
  postSlug,
  games,
  onPage,
  onOpenPost,
  onHome,
  onCreate,
  onExplore,
  onOpenGame,
  onAuth,
  frame = 'site',
}: {
  /** 'app' = arrived from More inside the product. 'site' = arrived from the
   *  public home. Same content, different chrome. */
  frame?: MarketingFrame;
  page: MarketingPage;
  postSlug: string | null;
  games: Game[];
  onPage: (page: MarketingPage) => void;
  onOpenPost: (slug: string | null) => void;
  onHome: () => void;
  onCreate: () => void;
  onExplore: () => void;
  onOpenGame: (game: Game) => void;
  onAuth: (mode?: AuthMode) => void;
}) {
  // In the app frame the page brings its own big hero, so the band would stack a
  // second one. In the site frame the band IS the header.
  const ownsItsHeader = page === 'about' || page === 'blog';
  const pageTitle: Record<MarketingPage, string> = {
    about: 'About GameTok',
    games: 'Explore games made on GameTok',
    pricing: 'Simple pricing',
    blog: 'Blog',
    changelog: 'Changelog',
    earn: 'Make a game. Share it. Grow.',
    faq: 'Frequently Asked Questions',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  };

  return (
    <main className="marketing-page">
      {frame === 'app'
        ? <MarketingTopbar active={page} onHome={onHome} onPage={onPage} onExplore={onExplore} />
        : <MarketingSiteTopbar onHome={onHome} onPage={onPage} onCreate={onCreate} onAuth={onAuth} />}
      {/* About and Blog bring their own headers and CTAs, so the generic band
          would stack a second hero on top of theirs. */}
      {!ownsItsHeader && (
        <section className="marketing-hero-band">
          <h1>{pageTitle[page]}</h1>
          <p>{marketingSubtitle(page, Boolean(postSlug))}</p>
          <div>
            <button onClick={onCreate}><Wand2 size={16} /> Create a game</button>
            <button onClick={onExplore}><Compass size={16} /> Explore app</button>
          </div>
        </section>
      )}

      <MarketingPageBody
        page={page}
        postSlug={postSlug}
        games={games}
        onCreate={onCreate}
        onExplore={onExplore}
        onOpenGame={onOpenGame}
        onOpenPost={onOpenPost}
      />

      <MarketingFooter onPage={onPage} onCreate={onCreate} />
    </main>
  );
}

function marketingSubtitle(page: MarketingPage, isPost: boolean) {
  if (isPost) return 'A GameTok field note for the playable social web.';
  if (page === 'about') return 'What GameTok is, who it is for, and where it is going.';
  if (page === 'games') return 'Discover GTA Lagos and playable games built by creators.';
  if (page === 'pricing') return 'Static v1 pricing cards for product storytelling. Payments come later.';
  if (page === 'blog') return 'Updates on AI game creation, releases, and creator tools.';
  if (page === 'changelog') return 'Everything changing as GameTok web grows from app replica to full product.';
  if (page === 'earn') return 'A creator-growth page for sharing playable games and bringing players back.';
  if (page === 'faq') return 'Answers for builders, players, and anyone trying to understand GameTok web.';
  return 'Static v1 legal content for navigation completeness. Final review still required.';
}

function DesktopExploreScreen({
  games,
  onOpenGame,
  onPage,
}: {
  user?: AuthUser | null;
  games: Game[];
  onPage?: (page: MarketingPage) => void;
  onTab?: (tab: Tab) => void;
  onOpenGame: (game: Game) => void;
  onCreate?: () => void;
  variant?: 'desktop' | 'mobile';
}) {
  const gta = games.find((g) => g.id === 'gta-lagos') || games[0] || GTA_LAGOS_GAME;
  const nrfc: Game = games.find((g) => g.id === 'no-rules-fc') || { id: 'no-rules-fc', name: 'No Rules FC', thumbnail: NRFC_COVER } as Game;

  return (
    <div className="modern-game-portal">
      {/* Top Header */}
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-brand">
            <img src="/about/icon.png" alt="GameTok" className="portal-logo" />
            <span className="portal-brand-text">GameTOK</span>
          </div>

          <nav className="portal-nav">
            <span className="portal-nav-link active">Games</span>
            <button className="portal-nav-link" onClick={() => onPage?.('about')}>About</button>
          </nav>

          <div className="portal-header-actions">
            <button className="portal-play-nav-btn" onClick={() => onOpenGame(gta)}>
              <Play size={14} fill="currentColor" /> Play GTA Lagos
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Showcase */}
      <main className="portal-main">
        {/* Hero Section */}
        <section className="portal-hero">
          <div className="portal-hero-media" onClick={() => onOpenGame(gta)}>
            <img
              src="https://games.gametok.co/gta-lagos/thumb.jpg"
              alt="GTA Lagos"
              className="portal-hero-img"
            />
            <div className="portal-hero-gradient" />
            <div className="portal-hero-play-badge" aria-label="Play GTA Lagos">
              <Play size={34} fill="#ffffff" color="#ffffff" style={{ marginLeft: 4 }} />
            </div>
          </div>

          <div className="portal-hero-info">
            <div className="portal-badges">
              <span className="portal-badge featured">OFFICIAL RELEASE</span>
              <span className="portal-badge">OPEN WORLD</span>
              <span className="portal-badge">MULTIPLAYER</span>
            </div>

            <h1 className="portal-game-title">GTA Lagos</h1>

            <div className="portal-creator-row">
              <img src="/about/icon.png" alt="GameTok" className="portal-creator-avatar" />
              <span>Published by <strong>GameTok</strong></span>
              <span className="portal-verified">✓</span>
            </div>

            <p className="portal-game-desc">
              Explore an open-world Lagos from Ojota to Lekki. Hustle, drive, run missions with your crew, and play with everyone online directly in your browser.
            </p>

            <div className="portal-hero-cta">
              <button className="portal-btn-primary" onClick={() => onOpenGame(gta)}>
                <Play size={18} fill="currentColor" /> PLAY NOW
              </button>
              <div className="portal-specs">
                <span>Free to Play</span>
                <span>•</span>
                <span>Browser & Mobile</span>
                <span>•</span>
                <span>No Download Required</span>
              </div>
            </div>
          </div>
        </section>

        {/* No Rules FC */}
        <section className="portal-hero">
          <div className="portal-hero-media" onClick={() => onOpenGame(nrfc)}>
            <img src={NRFC_COVER} alt="No Rules FC" className="portal-hero-img" />
            <div className="portal-hero-gradient" />
            <div className="portal-hero-play-badge" aria-label="Play No Rules FC">
              <Play size={34} fill="#ffffff" color="#ffffff" style={{ marginLeft: 4 }} />
            </div>
          </div>

          <div className="portal-hero-info">
            <div className="portal-badges">
              <span className="portal-badge featured">NEW</span>
              <span className="portal-badge">5V5 FOOTBALL</span>
              <span className="portal-badge">MULTIPLAYER</span>
            </div>

            <h1 className="portal-game-title">No Rules FC</h1>

            <div className="portal-creator-row">
              <img src="/about/icon.png" alt="GameTok" className="portal-creator-avatar" />
              <span>Published by <strong>GameTok</strong></span>
              <span className="portal-verified">✓</span>
            </div>

            <p className="portal-game-desc">
              5v5 hero football with no ref and no fouls. Pick your hero, use their super, party up with friends and play online with voice chat.
            </p>

            <div className="portal-hero-cta">
              <button className="portal-btn-primary" onClick={() => onOpenGame(nrfc)}>
                <Play size={18} fill="currentColor" /> PLAY NOW
              </button>
              <div className="portal-specs">
                <span>Free to Play</span>
                <span>•</span>
                <span>Browser & Mobile</span>
                <span>•</span>
                <span>No Download Required</span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section className="portal-features">
          <div className="portal-feature-card">
            <div className="portal-feature-icon">🚗</div>
            <h3>Open World Lagos</h3>
            <p>From the mainland markets and highways of Ojota and Ikeja to the high-rises and bridges of Victoria Island and Lekki.</p>
          </div>

          <div className="portal-feature-card">
            <div className="portal-feature-icon">👥</div>
            <h3>Online Multiplayer</h3>
            <p>Cruise the streets with friends, compete in street races, complete missions, and chat in real-time online.</p>
          </div>

          <div className="portal-feature-card">
            <div className="portal-feature-icon">⚡</div>
            <h3>Zero Installation</h3>
            <p>Built with web technology to run at 60 FPS directly in your browser on phone, tablet, and desktop.</p>
          </div>
        </section>
      </main>

      {/* Website Footer */}
      <footer className="portal-footer">
        <div className="portal-footer-inner">
          <div className="portal-footer-left">
            <img src="/about/icon.png" alt="GameTok" className="portal-footer-logo" />
            <span>GameTOK © 2026. All rights reserved.</span>
          </div>
          <div className="portal-footer-links">
            <button onClick={() => onPage?.('about')}>About</button>
            <button onClick={() => onPage?.('terms')}>Terms</button>
            <button onClick={() => onPage?.('privacy')}>Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// DesktopCreateWorkspace, ForgeDefenseStage, DesktopBuildPanel and DesktopForgeRail
// lived here — a second, weaker create experience kept in parallel with the mobile
// Dream Forge. Desktop now runs that same surface (CreateScreen variant="desktop"),
// so this is gone. DesktopRefinePanel below survived: its conversational edit loop
// was the one thing the old workspace did better, and it is mounted in the preview.


type RefineMessage = { role: 'user' | 'ai'; text: string };

function DesktopRefinePanel({
  draftId,
  gameTitle,
  currentSummary,
  onApplied,
}: {
  draftId: string;
  gameTitle?: string;
  currentSummary?: string;
  onApplied: (result: any) => void;
}) {
  const [messages, setMessages] = useState<RefineMessage[]>([
    { role: 'ai', text: 'What would you like to change about your game?' },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [finalInstruction, setFinalInstruction] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  const sendRefine = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking || applying) return;
    const nextMessages = [...messages, { role: 'user' as const, text: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setSuggestions([]);
    setThinking(true);
    try {
      const conversationHistory = nextMessages.map((message) => ({
        role: (message.role === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: message.text,
      }));
      const res: any = await ai.interpretEdit({
        instructions: trimmed,
        gameTitle,
        currentSummary,
        conversationHistory,
      });
      const intent = res?.intent || {};
      setMessages((items) => [...items, { role: 'ai', text: intent.reply || "Got it. I'll fold that into the edit." }]);
      if (intent.finalInstruction) setFinalInstruction(intent.finalInstruction);
      setSuggestions(Array.isArray(intent.suggestions) ? intent.suggestions : []);
    } catch (error: any) {
      setMessages((items) => [...items, { role: 'ai', text: error?.message || "I couldn't reach the edit assistant. Try again." }]);
    } finally {
      setThinking(false);
    }
  };

  const applyRefine = async () => {
    if (!finalInstruction || applying) return;
    setApplying(true);
    setProgress(0);
    setStatusMsg('Starting edit...');
    try {
      const { promise } = ai.edit(draftId, finalInstruction, undefined, [], {
        onJobProgress: ({ progress: nextProgress, statusMessage }) => {
          if (typeof nextProgress === 'number') setProgress(nextProgress);
          if (statusMessage) setStatusMsg(statusMessage);
        },
      });
      const result = await promise;
      onApplied(result);
      setMessages((items) => [...items, { role: 'ai', text: 'Edit applied. The preview is updated.' }]);
      setFinalInstruction(null);
      setSuggestions([]);
    } catch (error: any) {
      setMessages((items) => [...items, { role: 'ai', text: `Edit failed: ${error?.message || 'something went wrong'}` }]);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="desktop-refine-panel">
      <header>
        <span>✦ Dream Forge</span>
        <strong>{gameTitle || 'Untitled Dream'}</strong>
      </header>
      <div className="desktop-refine-messages">
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={message.role === 'ai' ? 'ai' : 'user'}>
            {message.text}
          </p>
        ))}
        {thinking && <p className="ai">Thinking...</p>}
      </div>
      {suggestions.length > 0 && !applying && (
        <div className="desktop-refine-chips">
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => sendRefine(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}
      {finalInstruction && !applying && (
        <button className="desktop-refine-apply" onClick={applyRefine}>
          Apply Edit
        </button>
      )}
      {applying ? (
        <div className="desktop-refine-progress">
          <i><span style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} /></i>
          <small>{statusMsg || 'Applying your edit...'}{progress ? ` ${Math.round(progress)}%` : ''}</small>
        </div>
      ) : (
        <div className="desktop-refine-input">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tell Dream Forge what to change..."
          />
          <button disabled={!input.trim() || thinking} onClick={() => sendRefine(input)}>
            <ArrowUp size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function DesktopAppSidebar({
  activeTab,
  user,
  onTab,
  onPage,
}: {
  activeTab: Tab;
  user: AuthUser | null;
  onTab: (tab: Tab) => void;
  /** Marketing pages, reached through More. */
  onPage?: (page: MarketingPage) => void;
}) {
  // The marketing pages were unreachable from inside the app — nav only existed on
  // the signed-out hero. More is that door, and it gives the previously dead
  // social icons somewhere to live.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const navItems: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
    { tab: 'explore', label: 'Games', icon: <Compass size={22} /> },
    { tab: 'create', label: 'Create', icon: <Wand2 size={22} /> },
    { tab: 'profile', label: 'Profile', icon: <User size={22} /> },
  ];
  const username = user?.displayName || user?.username || 'Player';
  return (
    <aside className="desktop-app-sidebar">
      <button className="desktop-sidebar-logo" onClick={() => onTab('explore')}>
        <img src="/app-assets/icon.png" alt="" />
        <strong>GameTok</strong>
      </button>

      <nav className="desktop-sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.tab}
            className={activeTab === item.tab || (item.tab === 'explore' && activeTab === 'home') ? 'active' : ''}
            onClick={() => onTab(item.tab)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}

        <div className="desktop-sidebar-more" ref={moreRef}>
          <button
            className={moreOpen ? 'active' : ''}
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <Grid3X3 size={22} />
            <span>More</span>
          </button>

          {moreOpen && (
            <div className="desktop-more-menu" role="menu">
              {onPage && MORE_PAGES.map((item) => (
                <button
                  key={item.page}
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    onPage(item.page);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <div className="desktop-more-socials">
                {SOCIAL_LINKS.map((social) => (
                  <a key={social.label} href={social.url} target="_blank" rel="noreferrer">
                    {social.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="desktop-sidebar-footer">
        <button className="desktop-sidebar-user" onClick={() => onTab('profile')}>
          <img src={avatarUrl(user?.username || 'gametok-player', user?.avatar || null, 80)} alt="" />
          <span>
            <strong>{username}</strong>
            <small>{user ? `@${user.username}` : 'Sign in'}</small>
          </span>
        </button>
      </div>
    </aside>
  );
}

function SearchSheet({
  games,
  creators,
  onOpenGame,
  onCreate,
}: {
  games: Game[];
  creators: Creator[];
  onOpenGame: (game: Game) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((game) =>
      `${game.name} ${game.description || ''} ${(game.categories || []).join(' ')} ${game.creatorDisplayName || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [games, query]);
  const creatorResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((creator) => `${creator.username} ${creator.displayName || ''}`.toLowerCase().includes(q));
  }, [creators, query]);

  return (
    <div className="search-sheet">
      <label className="sheet-search">
        <Search size={18} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games, creators, worlds" />
      </label>
      {!query && (
        <div className="search-categories">
          {CATEGORIES.map((category) => (
            <button key={category.slug} onClick={() => setQuery(category.label)}>
              <strong>{category.label}</strong>
              <small>{games.filter((game) => (game.categories || []).includes(category.slug)).length} games</small>
            </button>
          ))}
        </div>
      )}
      <button className="dream-search-card" onClick={onCreate}>
        <Wand2 size={22} />
        <span>
          <strong>Create a game from this search</strong>
          <small>Open Dream Forge and turn the idea into a playable draft.</small>
        </span>
      </button>
      <div className="sheet-section-title">Games</div>
      <div className="search-game-list">
        {results.slice(0, 18).map((game) => (
          <button key={game.id} onClick={() => onOpenGame(game)}>
            <img src={getThumbnailUrl(game)} alt="" onError={e => handleThumbError(e, game)} />
            <span>
              <strong>{game.name}</strong>
              <small>{categoryLabel((game.categories || [])[0] || 'Game')} · {formatCount(game.plays)} plays</small>
            </span>
            <Play size={16} fill="currentColor" />
          </button>
        ))}
      </div>
      <div className="sheet-section-title">Creators</div>
      <div className="search-creator-list">
        {creatorResults.slice(0, 8).map((creator) => (
          <button key={creator.id}>
            <img src={avatarUrl(creator.username, creator.avatar, 96)} alt="" />
            <span>
              <strong>{creator.displayName || creator.username}</strong>
              <small>@{creator.username}</small>
            </span>
            <Plus size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

function CreatorProfileSheet({
  creator,
  games,
  following,
  onOpenGame,
  onToggleFollow,
  onMessage,
}: {
  creator: Creator;
  games: Game[];
  following: boolean;
  onOpenGame: (game: Game) => void;
  onToggleFollow: () => void;
  onMessage: () => void;
}) {
  const creatorGames = games.filter((game) => (
    game.creatorId === creator.id
    || game.userId === creator.id
    || game.createdBy === creator.id
    || game.creatorUsername === creator.username
    || game.creatorDisplayName === creator.displayName
  ));

  return (
    <div className="creator-profile-sheet">
      <header>
        <img src={avatarUrl(creator.username, creator.avatar, 180)} alt="" />
        <span>
          <strong>{creator.displayName || creator.username}</strong>
          <small>@{creator.username}</small>
        </span>
      </header>
      <div className="creator-profile-actions">
        <button className={following ? 'following' : ''} onClick={onToggleFollow}>
          {following ? 'Following' : 'Follow'}
        </button>
        <button onClick={onMessage}><MessageCircle size={16} /> Message</button>
      </div>
      <div className="sheet-section-title">Games</div>
      <div className="search-game-list">
        {creatorGames.slice(0, 18).map((game) => (
          <button key={game.id} onClick={() => onOpenGame(game)}>
            <img src={getThumbnailUrl(game)} alt="" onError={e => handleThumbError(e, game)} />
            <span>
              <strong>{game.name}</strong>
              <small>{categoryLabel((game.categories || [])[0] || 'Game')} · {formatCount(game.plays)} plays</small>
            </span>
            <Play size={16} fill="currentColor" />
          </button>
        ))}
        {creatorGames.length === 0 && <EmptyListState title="No games here yet" text="This creator profile is live, but the backend did not return their games." />}
      </div>
    </div>
  );
}

function DirectMessageSheet({
  creator,
  embedded = false,
  onOpenProfile,
}: {
  creator: Creator;
  embedded?: boolean;
  onOpenProfile?: () => void;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState<Array<{ id?: string; text?: string; body?: string; content?: string; senderId?: string; fromMe?: boolean; createdAt?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    messages.getConversation(creatorIdFrom(creator))
      .then((data: any) => {
        if (!mounted) return;
        const rows = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
        setConversation(rows);
      })
      .catch(() => {
        if (mounted) setConversation([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [creator.id, creator.username]);

  const sendMessage = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const sent: any = await messages.send({ recipientId: creatorIdFrom(creator), text: body });
      setText('');
      setConversation((items) => [...items, sent?.message || { text: body, fromMe: true, createdAt: new Date().toISOString() }]);
    } catch (error: any) {
      setStatus(error?.message || 'Message failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`direct-message-sheet ${embedded ? 'embedded' : ''}`}>
      <header>
        <button className="dm-header-user" onClick={onOpenProfile}>
          <img src={avatarUrl(creator.username, creator.avatar, 96)} alt="" />
        </button>
        <span>
          <strong>{creator.displayName || creator.username}</strong>
          <small>@{creator.username}</small>
        </span>
        <button className="dm-header-action" onClick={onOpenProfile} aria-label="Conversation details">
          <User size={19} />
        </button>
      </header>
      <div className="direct-message-thread">
        {loading && <p className="dm-empty">Loading conversation...</p>}
        {!loading && conversation.length === 0 && (
          <div className="dm-start-state">
            <img src={avatarUrl(creator.username, creator.avatar, 128)} alt="" />
            <strong>{creator.displayName || creator.username}</strong>
            <small>@{creator.username}</small>
            <span>No messages yet. Send the first one.</span>
          </div>
        )}
        {conversation.map((message, index) => {
          const value = message.text || message.body || message.content || '';
          const mine = Boolean(message.fromMe || message.senderId === 'me');
          return (
            <p key={message.id || `${value}-${index}`} className={mine ? 'mine' : 'theirs'}>
              {value}
            </p>
          );
        })}
      </div>
      <div className="direct-message-input">
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Message ${creator.displayName || creator.username}`}
        />
        <button disabled={!text.trim() || sending} onClick={sendMessage}>
          <Send size={18} />
        </button>
      </div>
      {status && <p>{status}</p>}
    </div>
  );
}

function NotificationsSheet({ games, creators, onOpenGame }: { games: Game[]; creators: Creator[]; onOpenGame: (game: Game) => void }) {
  const items = creators.length === 0 ? [] : games.slice(0, 8).map((game, index) => ({
    id: `${game.id}-${index}`,
    game,
    creator: creators[index % creators.length],
    text: 'published a new game',
  }));

  return (
    <div className="notification-list">
      {items.map((item, index) => (
        <button key={item.id} onClick={() => onOpenGame(item.game)}>
          <span className="notification-icon">
            {index % 2 === 0 ? <Gamepad2 size={18} /> : <Heart size={18} />}
          </span>
          <span>
            <strong>@{item.creator.username}</strong>
            <small>{item.text} · {item.game.name}</small>
          </span>
          <img src={getThumbnailUrl(item.game)} alt="" onError={e => handleThumbError(e, item.game)} />
        </button>
      ))}
      {items.length === 0 && <EmptyListState title="No notifications yet" text="Backend notifications will appear here." />}
    </div>
  );
}

function Sheet({
  title,
  children,
  onClose,
  variant,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  variant?: 'auth' | 'message';
}) {
  return (
    <div className={`sheet-backdrop ${variant === 'auth' ? 'auth-backdrop' : ''}`}>
      <button className="sheet-clickout" onClick={onClose} aria-label="Close" />
      <section className={`bottom-sheet ${variant === 'auth' ? 'auth-sheet-shell' : ''} ${variant === 'message' ? 'message-sheet-shell' : ''}`}>
        {variant !== 'auth' && variant !== 'message' && (
          <>
            <div className="sheet-grabber" />
            <header>
              <h2>{title}</h2>
              <button className="icon-button" onClick={onClose}><X size={20} /></button>
            </header>
          </>
        )}
        {variant === 'message' && (
          <button className="message-sheet-close" onClick={onClose} aria-label="Close">
            <X size={21} />
          </button>
        )}
        {children}
      </section>
    </div>
  );
}

function CommentsSheet({
  game,
  creators,
  commentsStore = {},
  onAddComment,
  user,
}: {
  game: Game;
  creators: Creator[];
  commentsStore?: Record<string, Array<{ id: string; username: string; text: string; likes: number; createdAt?: string }>>;
  onAddComment?: (gameId: string, text: string, username: string) => void;
  user?: AuthUser | null;
}) {
  const [draft, setDraft] = useState('');
  const [apiComments, setApiComments] = useState<Array<{ id: string; username: string; text: string; likes: number; createdAt?: string }>>([]);

  useEffect(() => {
    if (!game?.id) return;
    commentsApi.list(game.id).then((res: any) => {
      if (res?.comments && Array.isArray(res.comments)) {
        setApiComments(res.comments);
      }
    }).catch(() => {});
  }, [game?.id]);

  const localComments = commentsStore[game.id] || [];
  const baseMockComments = creators.slice(0, 5).map((creator, index) => ({
    id: `mock-${creator.id}-${index}`,
    username: creator.username,
    text: index % 2 ? `The polish on ${game.name} is wild.` : 'This needs a speedrun leaderboard immediately.',
    likes: Math.max(0, 18 - index * 3),
  }));

  const allComments = [
    ...localComments,
    ...apiComments,
    ...baseMockComments,
  ];

  const postComment = () => {
    if (!draft.trim()) return;
    const authorUsername = user?.username || user?.displayName || 'guest';
    if (onAddComment) {
      onAddComment(game.id, draft.trim(), authorUsername);
    }
    commentsApi.create(game.id, draft.trim()).catch(() => {});
    setDraft('');
  };

  return (
    <div className="comments-list">
      {allComments.map((comment) => (
        <div className="comment-row" key={comment.id}>
          <img src={avatarUrl(comment.username, null, 96)} alt="" />
          <span>
            <strong>@{comment.username}</strong>
            <p>{comment.text}</p>
            <small>{comment.likes ? `${comment.likes} likes · ` : ''}Reply</small>
          </span>
          <Heart size={16} />
        </div>
      ))}
      {allComments.length === 0 && <EmptyListState title="No comments yet" text={`Be the first to comment on ${game.name}.`} />}
      <div className="comment-composer">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') postComment(); }} placeholder="Add a comment..." />
        <button onClick={postComment}><Send size={17} /></button>
      </div>
    </div>
  );
}

function LeaderboardSheet({ game }: { game: Game; creators: Creator[] }) {
  const rows: Array<{ id: string; username: string; score: number; current: boolean }> = [];
  return (
    <div className="leaderboard-list">
      <div className="leaderboard-summary">
        <Trophy size={26} />
        <span>
          <strong>{game.name}</strong>
          <small>Global leaderboard · updates live in the app shell</small>
        </span>
      </div>
      {rows.map((row, index) => (
        <div className={`score-row ${row.current ? 'current' : ''}`} key={row.id}>
          <strong>#{index + 1}</strong>
          <img src={avatarUrl(row.username, null, 96)} alt="" />
          <span>@{row.username}{row.current ? ' · YOU' : ''}</span>
          <em>{row.score.toLocaleString()}</em>
        </div>
      ))}
      {rows.length === 0 && <EmptyListState title="No scores yet" text="Leaderboard rows will appear when scores come from the backend." />}
    </div>
  );
}

function ShareSheet({ game }: { game: Game }) {
  const [copied, setCopied] = useState(false);
  const url = `https://gametok.co/game/${encodeURIComponent(game.id)}`;
  const copy = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: game.name, text: `Play ${game.name} on GameTok`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="share-panel">
      <img src={getThumbnailUrl(game)} alt="" onError={e => handleThumbError(e, game)} />
      <h3>{game.name}</h3>
      <p>{url}</p>
      <button onClick={copy}><Share2 size={17} /> {copied ? 'Copied' : 'Share / Copy Link'}</button>
    </div>
  );
}

// Renders Google's official Sign-In button. The callback receives an ID token
// (`credential`, a JWT) — the same kind of token the mobile app gets from the
// native Google SDK — which we forward to /api/auth/oauth.
function GoogleSignInButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google?.accounts?.id) return;
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_WEB_CLIENT_ID,
            callback: (response: any) => {
              if (response?.credential) onCredential(response.credential);
            },
          });
          ref.current.innerHTML = '';
          // GIS needs a fixed px width; match the host so it never overflows
          // the mobile auth panel (clamped to Google's supported range).
          const hostWidth = Math.round(ref.current.getBoundingClientRect().width);
          const buttonWidth = Math.min(400, Math.max(240, hostWidth || 360));
          window.google.accounts.id.renderButton(ref.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'center',
            width: buttonWidth,
          });
        } catch {
          if (!cancelled) setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  if (failed) {
    return <small className="auth-hint">Google Sign-In is unavailable right now. Try email instead.</small>;
  }
  return <div className="google-btn-host" ref={ref} />;
}

function AuthSheet({
  initialMode,
  onAuthed,
  onClose,
}: {
  initialMode: AuthMode;
  onAuthed: (user: AuthUser) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'auth' | 'username'>('auth');
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const socialAvatars = ['max_arcade', 'nova_builder', 'pixelmaya'];

  useEffect(() => {
    setMode(initialMode);
    setError('');
  }, [initialMode]);

  // New OAuth users come back with no username — route them to pick one,
  // mirroring the mobile onboarding flow.
  const finish = (user: AuthUser) => {
    if (!user.username) {
      setPendingUser(user);
      setUsername('');
      setStep('username');
    } else {
      onAuthed(user);
    }
  };

  const handleEmailAuth = async () => {
    if (!username.trim() || !password) {
      setError(mode === 'login' ? 'Username/email and password are required.' : 'Username and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data =
        mode === 'signup'
          ? await auth.signup(username.trim(), password)
          : await auth.login(username.trim(), password);
      if (!data?.token || !data?.user) {
        throw new Error('Sign-in did not return a valid session. Please try again.');
      }
      finish(data.user);
    } catch (e: any) {
      setError(e?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError('');
      setLoading(true);
      try {
        const profile = decodeJwt(credential) || {};
        const data = await auth.oauth('google', {
          idToken: credential,
          user: {
            id: profile.sub,
            email: profile.email,
            name: profile.name,
            photo: profile.picture,
          },
        });
        if (!data?.token || !data?.user) {
          throw new Error('Google sign-in did not return a valid session. Please try again.');
        }
        if (!data?.user?.username) {
          setPendingUser(data.user);
          setUsername('');
          setStep('username');
        } else {
          onAuthed(data.user);
        }
      } catch (e: any) {
        setError(e?.message || 'Google sign-in failed.');
      } finally {
        setLoading(false);
      }
    },
    [onAuthed],
  );

  const handleChooseUsername = async () => {
    if (!pendingUser || !username.trim()) {
      setError('Pick a username to continue.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res: any = await users.update(pendingUser.id, { username: username.trim() });
      onAuthed(res?.user || { ...pendingUser, username: username.trim() });
    } catch (e: any) {
      setError(e?.message || 'Could not save username.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'username') {
    return (
      <div className="auth-panel">
        <button className="auth-close" onClick={onClose} aria-label="Close"><X size={28} /></button>
        <div className="auth-brand-mark">
          <img src="/app-assets/icon.png" alt="" />
        </div>
        <h3>Pick your GameTok name</h3>
        <p className="auth-copy">This is the profile players will see on your games, scores, comments, and creator page.</p>
        <label className="auth-input-row">
          <User size={17} />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="username"
            autoFocus
          />
        </label>
        {error && <small className="auth-error">{error}</small>}
        <button className="auth-primary" disabled={loading} onClick={handleChooseUsername}>
          {loading ? 'Saving...' : 'Continue'}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <button className="auth-close" onClick={onClose} aria-label="Close"><X size={28} /></button>
      <div className="auth-brand-mark">
        <img src="/app-assets/icon.png" alt="" />
      </div>
      <h3>{mode === 'signup' ? 'Sign up to make your first game' : 'Log in to keep building'}</h3>
      <div className="auth-social-proof">
        <span>
          {socialAvatars.map((name) => (
            <img key={name} src={avatarUrl(name, null, 64)} alt="" />
          ))}
        </span>
        <p>{mode === 'signup' ? 'Join 30,000+ game builders today' : 'Jump back into your games and saves'}</p>
      </div>

      <div className="auth-idea-card">
        <span>{mode === 'signup' ? 'Start with:' : 'Last session:'}</span>
        <strong>{mode === 'signup' ? '"A boss-rush arena that evolves every round"' : 'GTA Lagos is waiting'}</strong>
      </div>

      <div className="auth-email-fields">
        <label className="auth-input-row">
          <User size={17} />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={mode === 'login' ? 'Username or email' : 'Username'}
            autoComplete="username"
          />
        </label>
        <label className="auth-input-row">
          <Zap size={17} />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onKeyDown={(event) => event.key === 'Enter' && handleEmailAuth()}
          />
        </label>
        <button className="auth-primary" disabled={loading} onClick={handleEmailAuth}>
          {loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </div>

      {error && <small className="auth-error">{error}</small>}

      <div className="auth-divider"><span>or continue with</span></div>

      <GoogleSignInButton onCredential={handleGoogleCredential} />

      <div className="auth-legal">
        By continuing, you agree to our <button>Terms</button> and <button>Privacy Policy</button>
      </div>

      <button
        className="auth-toggle"
        onClick={() => {
          setMode(mode === 'signup' ? 'login' : 'signup');
          setError('');
        }}
      >
        {mode === 'signup' ? 'Already have an account? Log in' : 'Need an account? Sign up'}
      </button>
    </div>
  );
}

export default App;
