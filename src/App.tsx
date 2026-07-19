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
  Bell,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Gamepad2,
  Grid3X3,
  Globe,
  Hash,
  Heart,
  Home,
  Image as ImageIcon,
  Menu,
  MessageCircle,
  Mic,
  Palette,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Share2,
  Sparkles,
  Trophy,
  User,
  UserPlus,
  Users,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { ai, auth, users, messages, likes as likesApi, savedGames as savedGamesApi, getToken, setToken } from './services/api';
import MobileGate from './components/MobileGate';
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

const API_URL = 'https://gametok-backend-production.up.railway.app/api';
const API_ORIGIN = API_URL.replace(/\/api$/, '');
const GAMES_HOST = 'https://games.gametok.co';
const DESKTOP_CREATE_PROMPTS = [
  'Make a neon drifting game with midnight streets, police chases, and upgradeable cars',
  'Make a cozy farming RPG where every crop unlocks a new magical creature',
  'Make a boss-rush platformer where the level changes every time you jump',
  'Make a multiplayer arena where players build traps, steal coins, and survive the storm',
  'Make a cooking chaos game where orders mutate, kitchens move, and combos explode',
];

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

type Tab = 'home' | 'explore' | 'create' | 'connect' | 'profile';
type CreatePhase = 'idle' | 'refining' | 'generating' | 'preview' | 'publish';
type Modal = 'comments' | 'leaderboard' | 'share' | 'auth' | 'search' | 'notifications' | 'creator-profile' | 'message';
type MarketingPage = 'games' | 'pricing' | 'blog' | 'changelog' | 'earn' | 'faq' | 'privacy' | 'terms';
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
  category?: string | null;
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

const BLOG_POSTS = [
  {
    slug: 'building-playable-social-games',
    category: 'Product',
    date: 'June 2026',
    title: 'Building playable social games for the feed era',
    excerpt: 'GameTok is becoming a place where every post can be played, remixed, shared, and turned into a new world.',
    body: [
      'GameTok starts from a simple idea: the feed should not only show games, it should let people play them immediately.',
      'The web experience gives creators a bigger canvas to describe ideas, attach references, and turn those ideas into playable social moments.',
      'Our direction is mobile-native energy with desktop creation power: fast discovery, expressive avatars, and playable games that travel like posts.',
    ],
  },
  {
    slug: 'creator-first-game-generation',
    category: 'Studio',
    date: 'June 2026',
    title: 'Creator-first game generation',
    excerpt: 'The Create experience is being shaped around prompts, references, drafts, previews, and a fast path back into the feed.',
    body: [
      'Game creation needs to feel less like opening a game engine and more like posting an idea with superpowers.',
      'That means the desktop Create surface should be cinematic and focused, while mobile Create keeps the app-like Dream Forge flow.',
      'The result is a hybrid system: powerful on desktop, familiar on mobile, and connected to the same playable feed.',
    ],
  },
  {
    slug: 'why-playable-social-matters',
    category: 'Vision',
    date: 'June 2026',
    title: 'Why playable social matters',
    excerpt: 'Screenshots and trailers are not enough. The next social gaming surface should let the audience touch the idea instantly.',
    body: [
      'A playable post collapses the distance between watching and trying.',
      'For creators, that means faster feedback. For players, it means discovery feels alive. For GameTok, it means the feed is the product.',
    ],
  },
];

const PRICING_PLANS = [
  { name: 'Starter', price: '$0', audience: 'For players and first-time builders.', features: ['Play community games', 'Create starter drafts', 'Public sharing', 'GameTok avatar profile'] },
  { name: 'Creator', price: '$19', audience: 'For creators building often.', features: ['More monthly generations', 'Private drafts', 'Priority preview builds', 'Export-ready project history'] },
  { name: 'Studio', price: '$79', audience: 'For teams and serious game channels.', features: ['Team workspace', 'Higher generation limits', 'Early model access', 'Priority support'] },
];

const FAQ_GROUPS = [
  {
    title: 'General',
    items: [
      ['What is GameTok?', 'GameTok is a playable social feed where creators can generate, share, and discover games.'],
      ['Do I need to code?', 'No. The goal is to describe the game and let the system build a playable draft.'],
      ['Is the web app replacing mobile?', 'No. Desktop is for bigger creation and browsing, while mobile keeps the feed-first app feel.'],
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

const HOME_VIDEOS = [
  '/home-videos/hero-1.mp4',
  '/home-videos/hero-2.mp4',
  '/home-videos/hero-3.mp4',
  '/home-videos/hero-4.mp4',
  '/home-videos/hero-5.mp4',
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

const getThumbnailUrl = (game: Game) => {
  const value = game.thumbnail?.trim();
  if (value) {
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


const getGameUrl = (game: Game) => {
  if (game.embedUrl) {
    const raw = game.embedUrl.startsWith('/') ? `${API_ORIGIN}${game.embedUrl}` : game.embedUrl;
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
  if (uri && !uri.startsWith('dicebear://') && !uri.startsWith('avatar-creator://')) return uri;
  const config = getDicebearConfig(uri) || buildDefaultAvatarConfig(seed || uri || 'gametok');
  const svg = createAvatar(ADVENTURER_STYLE, buildAdventurerOptions(config, Math.min(256, Math.max(48, size)))).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

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

function useGameTokData() {
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
          setGames(gamesRes.value.games);
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
  }, []);

  return { games, creators, loading, offline };
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

function creatorFromGame(game: Game | null): Creator | null {
  if (!game) return null;
  const id = game.creatorId || game.userId || game.createdBy || game.creatorUsername || '';
  if (!id && !game.creatorUsername && !game.creatorDisplayName) return null;
  return {
    id: String(id || game.creatorUsername || game.creatorDisplayName),
    username: game.creatorUsername || game.creatorDisplayName || 'creator',
    displayName: game.creatorDisplayName || game.creatorUsername || 'GameTok creator',
    avatar: game.creatorAvatar || undefined,
    verified: game.creatorVerified,
  };
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
  const isMobile = useIsMobile();
  const { games, creators, loading, offline } = useGameTokData();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [marketingPage, setMarketingPage] = useState<MarketingPage | null>(null);
  const [gameIndex, setGameIndex] = useState(0);
  const [hudHidden, setHudHidden] = useState(false);
  // Home tab hosts the explore-style browse screen; the full-screen player
  // (deck mode) is entered via the center Play button or by opening a game.
  const [gameDeckMode, setGameDeckMode] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [feedMotion, setFeedMotion] = useState<'next' | 'previous' | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  // Track whether the mobile app gate is still on screen. While it is, we must
  // NOT mount the auth wall underneath — the semi-transparent gate paints over
  // the wall and both surfaces show through each other.
  const [mobileGateOpen, setMobileGateOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const dismissed = localStorage.getItem('gt_mobile_gate_dismissed_v1') === '1';
    const forced = new URLSearchParams(window.location.search).get('mobileGate') === '1';
    const ua = navigator.userAgent || '';
    const uaMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (dismissed && !forced) return false;
    return forced || (uaMobile && window.innerWidth < 900);
  });
  const [likedGames, setLikedGames] = useState(() => readStoredSet(STORAGE_KEYS.likedGames));
  const [savedGames, setSavedGames] = useState(() => readStoredSet(STORAGE_KEYS.savedGames));
  const [followedCreators, setFollowedCreators] = useState(() => readStoredSet(STORAGE_KEYS.followedCreators));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);

  // Restore session from the shared backend token (same token the mobile app uses).
  useEffect(() => {
    if (!getToken()) return;
    let mounted = true;
    auth
      .me()
      .then((data: any) => {
        if (mounted && data?.user) setAuthUser(data.user);
      })
      .catch((err: any) => {
        // Only sign the user out when the token is actually rejected (401/403).
        // A transient network error / timeout must NOT wipe the session, or a
        // logged-in user gets bounced back to the login wall on reload.
        if (err?.status === 401 || err?.status === 403) {
          setToken(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthed = useCallback((user: AuthUser) => {
    setAuthUser(user);
    setModal(null);
    setMarketingPage(null);
    if (activeTab !== 'create') {
      setActiveTab('profile');
      setGameDeckMode(false);
      setHudHidden(false);
    }
  }, [activeTab]);

  const handleLogout = useCallback(() => {
    void auth.logout();
    setAuthUser(null);
    setLikedGames(new Set());
    setSavedGames(new Set());
    setFollowedCreators(new Set());
  }, []);

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

  const activeGame = games.length > 0 ? games[((gameIndex % games.length) + games.length) % games.length] : null;

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

  const activeCreatorId = activeGame?.creatorId || activeGame?.userId || activeGame?.createdBy || activeGame?.creatorUsername || activeGame?.creatorDisplayName || '';
  const toggleActiveLike = () => {
    if (!activeGame) return;
    toggleBackendSet(setLikedGames, activeGame.id, () => likesApi.toggle(activeGame.id));
  };
  const toggleActiveSave = () => {
    if (!activeGame) return;
    toggleBackendSet(setSavedGames, activeGame.id, () => savedGamesApi.toggle(activeGame.id));
  };
  const toggleActiveFollow = () => {
    if (!activeCreatorId) return;
    toggleBackendSet(setFollowedCreators, activeCreatorId, () => users.follow(activeCreatorId));
  };
  const toggleCreatorFollow = (creator: Creator | null) => {
    const id = creatorIdFrom(creator);
    if (!id) return;
    toggleBackendSet(setFollowedCreators, id, () => users.follow(id));
  };
  const openCreatorProfile = (creator: Creator | null) => {
    if (!creator) return;
    setSelectedCreator(creator);
    setModal('creator-profile');
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
    setGameDeckMode(true);
    setGamePaused(false);
    setHudHidden(false);
    setActiveTab('home');
    setMarketingPage(null);
    setModal(null);
    pushRecentGame(game.id);
  };

  const goTab = (tab: Tab) => {
    // Creating a game requires an account; browsing/exploring does not.
    if (tab === 'create' && requireAuth('signup')) return;
    setMarketingPage(null);
    setActiveTab(tab);
    // Tabs never auto-enter the player — that's the center Play button's job.
    setGameDeckMode(false);
    setHudHidden(false);
  };

  const goMarketingPage = (page: MarketingPage) => {
    setMarketingPage(page);
    setActiveTab('home');
    setGameDeckMode(false);
    setHudHidden(false);
    setModal(null);
  };

  const openAuth = (mode: AuthMode = 'signup') => {
    setAuthMode(mode);
    setModal('auth');
  };

  const animateFeed = (direction: 'next' | 'previous') => {
    setFeedMotion(direction);
    window.setTimeout(() => setFeedMotion(null), 360);
  };

  const nextGame = () => {
    if (games.length === 0) return;
    animateFeed('next');
    setGamePaused(false);
    setGameIndex((value) => (value + 1) % games.length);
  };
  const previousGame = () => {
    if (games.length === 0) return;
    animateFeed('previous');
    setGamePaused(false);
    setGameIndex((value) => (value - 1 + games.length) % games.length);
  };

  // Enter the full-screen player (center Play button on the mobile nav).
  const openPlayer = () => {
    setMarketingPage(null);
    setActiveTab('home');
    setGameDeckMode(true);
    setHudHidden(false);
    setGamePaused(false);
  };

  // Freeze/resume the active game via the gt-pause/gt-resume handler the
  // backend injects into every served game.
  const toggleGamePause = () => {
    const iframe = document.querySelector<HTMLIFrameElement>('.feed-scroll iframe');
    iframe?.contentWindow?.postMessage({ type: gamePaused ? 'gt-resume' : 'gt-pause' }, '*');
    setGamePaused((value) => !value);
  };
  useEffect(() => {
    const storedGameId = localStorage.getItem(STORAGE_KEYS.activeGame);
    if (!storedGameId || games.length === 0) return;
    const storedIndex = games.findIndex((game) => game.id === storedGameId);
    if (storedIndex >= 0) setGameIndex(storedIndex);
  }, [games]);

  useEffect(() => {
    if (activeGame?.id) localStorage.setItem(STORAGE_KEYS.activeGame, activeGame.id);
  }, [activeGame?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping || modal) return;
      if (activeTab !== 'home' || marketingPage) return;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') {
        event.preventDefault();
        nextGame();
      }
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        previousGame();
      }
      if (event.key.toLowerCase() === 'h') setHudHidden((value) => !value);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, games.length, marketingPage, modal]);

  return (
    <div className={`gametok-shell ${activeTab === 'home' && !marketingPage ? 'home-mode' : ''} ${marketingPage ? 'marketing-mode' : ''} ${activeTab === 'create' && !marketingPage ? 'create-mode' : ''} ${activeTab === 'explore' && !marketingPage && !isMobile && authUser ? 'explore-mode' : ''}`}>
      <MobileGate
        onContinueInBrowser={() => {
          setMobileGateOpen(false);
          setAuthMode('login');
          if (!isMobile) openAuth('login');
        }}
      />

      {!marketingPage && (!isMobile || !mobileGateOpen) && <div className="phone-stage">
        <main className="app-screen">
          {isMobile && activeTab === 'home' && !gameDeckMode && (
            <DesktopExploreScreen
              variant="mobile"
              user={authUser}
              games={games}
              creators={creators}
              onTab={goTab}
              onOpenGame={openGame}
              onOpenCreator={openCreatorProfile}
              onCreate={() => goTab('create')}
            />
          )}
          {activeTab === 'home' && (!isMobile || gameDeckMode) && (
            activeGame ? (
              <HomeFeed
                games={games}
                game={activeGame}
                index={gameIndex}
                loading={loading}
                offline={offline}
                hudHidden={hudHidden}
                gameDeckMode={gameDeckMode}
                liked={likedGames.has(activeGame.id)}
                saved={savedGames.has(activeGame.id)}
                following={followedCreators.has(activeCreatorId)}
                onIndex={setGameIndex}
                onOpenModal={setModal}
                onToggleLike={toggleActiveLike}
                onToggleSave={toggleActiveSave}
                onToggleFollow={toggleActiveFollow}
                onOpenExplore={() => {
                  setGameDeckMode(false);
                  setActiveTab('home');
                }}
              />
            ) : (
              <EmptyAppState loading={loading} title="No games yet" text="The backend did not return any games for the feed." />
            )
          )}
          {isMobile && activeTab === 'explore' && (
            <DesktopExploreScreen
              variant="mobile"
              user={authUser}
              games={games}
              creators={creators}
              onTab={goTab}
              onOpenGame={openGame}
              onOpenCreator={openCreatorProfile}
              onCreate={() => goTab('create')}
            />
          )}
          {activeTab === 'create' && <CreateScreen onOpenGame={openGame} fallbackGame={activeGame || null} />}
          {activeTab === 'connect' && (
            <ConnectScreen
              creators={creators}
              onOpenCreator={openCreatorProfile}
              onOpenChat={openCreatorMessage}
              onOpenGame={openGame}
              variant={isMobile ? 'mobile' : 'desktop'}
              user={authUser}
              games={games}
            />
          )}
          {activeTab === 'profile' && <ProfileScreen games={games} onOpenGame={openGame} onAuth={() => openAuth('login')} user={authUser} onLogout={handleLogout} />}
        </main>

        <BottomNav
          activeTab={activeTab}
          gameDeckMode={gameDeckMode && activeTab === 'home'}
          hudHidden={hudHidden}
          paused={gamePaused}
          onTab={(tab) => {
            goTab(tab);
          }}
          onPlay={openPlayer}
          onTogglePlay={toggleGamePause}
          onNext={nextGame}
          onPrevious={previousGame}
          onToggleHud={() => setHudHidden((value) => !value)}
          onHomeDeckExit={() => {
            setGameDeckMode(false);
            setHudHidden(false);
          }}
        />
      </div>}

      {!isMobile && marketingPage && (
        <StaticMarketingPage
          page={marketingPage}
          games={games}
          onPage={goMarketingPage}
          onHome={() => {
            setMarketingPage(null);
            setActiveTab('home');
            setGameDeckMode(false);
          }}
          onCreate={() => goTab('create')}
          onExplore={() => goTab('explore')}
          onAuth={openAuth}
          onOpenGame={openGame}
        />
      )}

      {!isMobile && activeTab === 'home' && !marketingPage && !authUser && (
        <DesktopHomeHero
          onCreate={() => goTab('create')}
          onExplore={() => goTab('explore')}
          onAuth={openAuth}
          onPage={goMarketingPage}
        />
      )}

      {!isMobile && activeTab === 'home' && !marketingPage && authUser && activeGame && (
        <DesktopPlayHome
          user={authUser}
          game={activeGame}
          games={games}
          index={gameIndex}
          liked={likedGames.has(activeGame.id)}
          saved={savedGames.has(activeGame.id)}
          following={followedCreators.has(activeCreatorId)}
          feedMotion={feedMotion}
          onTab={goTab}
          onNext={nextGame}
          onPrevious={previousGame}
          onOpenModal={setModal}
          onOpenCreator={() => openCreatorProfile(creatorFromGame(activeGame))}
          onToggleLike={toggleActiveLike}
          onToggleSave={toggleActiveSave}
          onToggleFollow={toggleActiveFollow}
        />
      )}

      {!isMobile && activeTab === 'create' && !marketingPage && (
        <DesktopCreateWorkspace
          games={games}
          activeTab={activeTab}
          onTab={goTab}
          user={authUser}
          onAuthRequired={() => openAuth('signup')}
        />
      )}

      {!isMobile && activeTab === 'explore' && !marketingPage && authUser && (
        <DesktopExploreScreen
          user={authUser}
          games={games}
          creators={creators}
          onTab={goTab}
          onOpenGame={openGame}
          onOpenCreator={openCreatorProfile}
          onCreate={() => goTab('create')}
        />
      )}

      {!isMobile && activeTab !== 'home' && activeTab !== 'create' && activeTab !== 'explore' && !marketingPage && (
        <DesktopRail activeTab={activeTab} user={authUser} onTab={goTab} />
      )}

      {modal && (
        <Sheet title={modalTitle(modal)} onClose={() => setModal(null)} variant={modal === 'auth' ? 'auth' : modal === 'message' ? 'message' : undefined}>
          {modal === 'comments' && activeGame && <CommentsSheet game={activeGame} creators={creators} />}
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

function HomeFeed({
  game,
  index,
  games,
  loading,
  offline,
  hudHidden,
  gameDeckMode,
  liked,
  saved,
  following,
  onIndex,
  onOpenModal,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenExplore,
}: {
  game: Game;
  index: number;
  games: Game[];
  loading: boolean;
  offline: boolean;
  hudHidden: boolean;
  gameDeckMode: boolean;
  liked: boolean;
  saved: boolean;
  following: boolean;
  onIndex: (idx: number) => void;
  onOpenModal: (modal: Modal) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onToggleFollow: () => void;
  onOpenExplore: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollUntil = useRef(0);
  const [showPreviewArt, setShowPreviewArt] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    setGameStarted(true);
    setShowPreviewArt(true);
    const timer = window.setTimeout(() => setShowPreviewArt(false), 3500);
    return () => window.clearTimeout(timer);
  }, [game.id]);

  // Sync active index from native scroll snapping — TikTok-style.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || games.length === 0) return;
    const items = scroll.querySelectorAll<HTMLElement>('.feed-item');
    if (items.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let best = { ratio: 0, idx: -1 };
        entries.forEach((entry) => {
          if (entry.intersectionRatio > best.ratio) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            best = { ratio: entry.intersectionRatio, idx };
          }
        });
        if (Date.now() < programmaticScrollUntil.current) return;
        if (best.idx >= 0 && best.ratio > 0.6 && best.idx !== index) {
          onIndex(best.idx);
        }
      },
      { root: scroll, threshold: [0.4, 0.6, 0.8] },
    );
    items.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [games.length, index, onIndex]);

  // Programmatically align the scroll container with the current index.
  // Runs on index change (nav buttons/keyboard), on mount, and when games
  // populate — that last one covers the case where the container remounts
  // (HMR, tab switch) with scrollTop=0 while parent state still holds a
  // non-zero index, which would otherwise mount the iframe in the wrong
  // item and leave the visible one empty.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || games.length === 0) return;
    const target = scroll.querySelector<HTMLElement>(`.feed-item[data-index="${index}"]`);
    if (!target) return;
    if (Math.abs(target.offsetTop - scroll.scrollTop) < 8) return;
    programmaticScrollUntil.current = Date.now() + 400;
    scroll.scrollTo({ top: target.offsetTop, behavior: 'auto' });
  }, [index, games.length]);

  return (
    <section className="home-feed">
      <div className="feed-topbar">
        <button className="icon-button" onClick={onOpenExplore} aria-label="Explore">
          <Search size={19} />
        </button>
        <button className="icon-button" aria-label="Notifications" onClick={() => onOpenModal('notifications')}>
          <Bell size={19} />
        </button>
      </div>

      {loading ? (
        <div className="game-loading">
          <RefreshCw className="spin" size={34} />
          <p>Loading games...</p>
        </div>
      ) : (
        <div className="feed-scroll" ref={scrollRef}>
          {games.map((g, i) => (
            <article className="feed-item" key={g.id} data-index={i}>
              <div className="game-frame">
                {i === index && gameStarted && (
                  <iframe
                    key={g.id}
                    className="game-iframe"
                    title={g.name}
                    src={getGameUrl(g)}
                    allow="autoplay; fullscreen; clipboard-write"
                    onLoad={() => window.setTimeout(() => setShowPreviewArt(false), 900)}
                  />
                )}
                {Math.abs(i - index) <= 1 && (
                  <div className="thumbnail-backdrop" style={{ backgroundImage: `url(${getThumbnailUrl(g)})` }} />
                )}
                {i === index && (!gameStarted || showPreviewArt) && (
                  <div className="game-preview-art">
                    <img src={getThumbnailUrl(g)} alt="" onError={e => handleThumbError(e, g)} />
                    <strong>{g.name}</strong>
                    <button onClick={() => setGameStarted(true)}><Play size={15} fill="currentColor" /> Play game</button>
                  </div>
                )}
                {i === index && offline && <div className="offline-pill">Offline</div>}
              </div>
            </article>
          ))}
        </div>
      )}

      {!hudHidden && (
        <>
          <div className="feed-actions">
            <ActionButton icon={<Share2 size={22} />} label="Share" onClick={() => onOpenModal('share')} />
            <ActionButton icon={<MessageCircle size={22} />} label={formatCount(game.commentsCount || 0)} onClick={() => onOpenModal('comments')} />
            <ActionButton active={liked} tone="like" icon={<Heart size={22} fill={liked ? 'currentColor' : 'none'} />} label={formatCount((game.likes || 0) + (liked ? 1 : 0))} onClick={onToggleLike} />
            <ActionButton active={saved} icon={<Bookmark size={22} fill={saved ? 'currentColor' : 'none'} />} label={saved ? 'Saved' : 'Save'} onClick={onToggleSave} />
          </div>

          <div className="game-caption">
            <div className="creator-avatar-wrap">
              <img src={avatarUrl(game.creatorDisplayName || game.creatorUsername, game.creatorAvatar, 108)} alt="" />
              <button aria-label="Follow">
                <Plus size={11} strokeWidth={3} />
              </button>
            </div>
            <div className="caption-copy">
              <div className="creator-line">
                <strong>@{game.creatorDisplayName || game.creatorUsername || 'anonymous'}</strong>
                {game.creatorVerified && <span className="verified-dot">✓</span>}
              </div>
              <h1>{game.name}</h1>
              <p>{game.description || 'Playable instantly on GameTok.'}</p>
              <div className="caption-tags">
                <span>{game.category || 'Arcade'}</span>
                <span>{formatCount(game.plays)} plays</span>
              </div>
            </div>
            <button className={`follow-pill ${following ? 'following' : ''}`} onClick={onToggleFollow}>
              {following ? 'Following' : 'Follow'}
            </button>
          </div>
        </>
      )}

      {!gameDeckMode && <div className="deck-shadow" />}
    </section>
  );
}

function ActionButton({ icon, label, active, tone, onClick }: { icon: React.ReactNode; label: string; active?: boolean; tone?: 'like'; onClick?: () => void }) {
  return (
    <button className={`feed-action ${active ? 'active' : ''} ${tone === 'like' ? 'like-action' : ''}`} onClick={onClick}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );
}



function CreateScreen({ onOpenGame, fallbackGame }: { onOpenGame: (game: Game) => void; fallbackGame: Game | null }) {
  const FORGE_STEPS = useMemo(() => ([
    { label: 'Design', phases: ['maker_workspace', 'spec', 'foundation', 'queued'] },
    { label: 'Art', phases: ['assets'] },
    { label: 'Code', phases: ['build', 'build_continuing', 'build_truncated'] },
    { label: 'Test', phases: ['verify', 'repair', 'save'] },
  ]), []);
  const [phase, setPhase] = useState<CreatePhase>('idle');
  const [studioTab, setStudioTab] = useState<'create' | 'drafts'>('create');
  const [prompt, setPrompt] = useState('');
  const [selectedIdea, setSelectedIdea] = useState(PROMPT_IDEAS[0]);
  const [progress, setProgress] = useState(0);
  const [forgePhase, setForgePhase] = useState('queued');
  const [forgeMessage, setForgeMessage] = useState('Starting forge...');
  const [showTools, setShowTools] = useState(false);
  const [labsMode] = useState(false);
  const [attachedAssets, setAttachedAssets] = useState<DreamAttachment[]>([]);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioTab, setAudioTab] = useState<'bgm' | 'sfx'>('bgm');
  const [audioQuery, setAudioQuery] = useState('');
  const [audioTracks, setAudioTracks] = useState<FreesoundTrack[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<FreesoundTrack | null>(null);
  const [previewingAudioId, setPreviewingAudioId] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
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
  const drafts = useMemo(() => [
    ...(fallbackGame ? [{ id: 'draft-1', title: fallbackGame.name, status: 'Playable draft', game: fallbackGame }] : []),
  ], [fallbackGame]);
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

  useEffect(() => {
    if (phase !== 'generating') return undefined;

    let cancelled = false;
    setProgress(8);
    setForgePhase('queued');
    setForgeMessage('Connecting to Dream Forge...');
    setGenerateError(null);

    const runGeneration = async () => {
      try {
        const finalPrompt = (prompt || selectedIdea).trim();
        const attachments = attachedAssets.map(({ type, role, url, label, instruction, duration }) => ({
          type,
          role,
          url,
          label,
          title: label,
          instruction,
          duration,
        }));

        const dreamCall = labsMode ? ai.dreamLabs : ai.dream;
        const { promise } = dreamCall(finalPrompt, attachments, {
          onJobStarted: () => {
            setProgress((value) => Math.max(value, 12));
            setForgeMessage('Forge agent online — reading your game idea...');
          },
          onJobProgress: ({ progress: serverProgress, phase: serverPhase, statusMessage, queuePosition }) => {
            if (typeof serverProgress === 'number') {
              setProgress((prev) => Math.max(prev, serverProgress));
            }
            if (serverPhase) setForgePhase(serverPhase);
            if (statusMessage) {
              setForgeMessage(statusMessage);
            } else if (serverPhase === 'queued' && queuePosition) {
              setForgeMessage(`Queued — position ${queuePosition} in line...`);
            }
          },
        });
        const result: any = await promise;
        if (cancelled) return;

        if (result?.htmlPreview) {
          setPreviewHtml(result.htmlPreview);
          setProgress(100);
          setForgeMessage('Preview ready.');
          setPhase('preview');
          return;
        }

        throw new Error(result?.error || 'Generation finished without a playable preview.');
      } catch (error: any) {
        if (cancelled) return;
        setGenerateError(error?.message || 'Generation failed.');
        setPhase('refining');
      }
    };

    void runGeneration();
    return () => {
      cancelled = true;
    };
  }, [attachedAssets, labsMode, phase, prompt, selectedIdea]);

  const activeForgeStep = useMemo(() => {
    const byPhase = FORGE_STEPS.findIndex((step) => step.phases.includes(forgePhase));
    if (byPhase >= 0) return byPhase;
    if (progress >= 78) return 3;
    if (progress >= 52) return 2;
    if (progress >= 28) return 1;
    return 0;
  }, [FORGE_STEPS, forgePhase, progress]);

  const start = () => {
    if (!prompt.trim()) setPrompt(selectedIdea);
    setGenerateError(null);
    setPhase('refining');
  };

  const surprise = () => {
    const idea = PROMPT_IDEAS[Math.floor(Math.random() * PROMPT_IDEAS.length)];
    setSelectedIdea(idea);
    setPrompt(idea);
    setGenerateError(null);
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
      setGenerateError('That video is a bit large — keep clips under ~12MB so they load fast in the game.');
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
    <section className="create-screen">
      <div className="create-bg" />
      <header className="create-mobile-header">
        {studioTab === 'create' ? (
          <>
            <button className="create-avatar-button" onClick={() => setShowTools((value) => !value)}>
              <img src={avatarUrl('guest-player', null, 104)} alt="" />
            </button>
            <strong>gametok</strong>
            <span />
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

          {generateError && (
            <div className="create-error-box">
              <span>{generateError}</span>
              <button onClick={() => setGenerateError(null)}><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      {studioTab === 'drafts' && (
        <div className="drafts-panel">
          <div className="drafts-header">
            <h1>{drafts.length} drafts</h1>
            <button onClick={() => setStudioTab('create')}><Plus size={16} /> New game</button>
          </div>
          <div className="draft-grid">
            {drafts.map((draft) => (
              <button key={draft.id} onClick={() => onOpenGame(draft.game)}>
                <img src={getThumbnailUrl(draft.game)} alt="" onError={e => handleThumbError(e, draft.game)} />
                <span>
                  <strong>{draft.title}</strong>
                  <small>{draft.status}</small>
                </span>
                <Play size={16} fill="currentColor" />
              </button>
            ))}
          </div>
        </div>
      )}

      {(phase === 'idle' || studioTab === 'drafts') && (
        <div className="create-bottom-tabs">
          <button className={studioTab === 'create' ? 'active' : ''} onClick={() => setStudioTab('create')}>
            <Home size={20} /> <span>Home</span>
          </button>
          <button className={studioTab === 'drafts' ? 'active' : ''} onClick={() => setStudioTab('drafts')}>
            <Gamepad2 size={20} /> <span>Drafts{drafts.length ? ` (${drafts.length})` : ''}</span>
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
          <div className="refine-actions">
            <button onClick={() => setPhase('idle')}>Edit Wish</button>
            <button className="primary" onClick={() => setPhase('generating')}><Zap size={16} /> Build Game</button>
          </div>
          {forgeDurationHint && <p className="forge-duration-hint">{forgeDurationHint}</p>}
          {generateError && <p className="create-error">{generateError}</p>}
        </div>
      )}

      {studioTab === 'create' && phase === 'generating' && (
        <div className="generating-panel">
          <div className="forge-loader">
            <RefreshCw className="spin" size={44} />
          </div>
          <h1>Forging your game...</h1>
          <p className="forge-live-status">{forgeMessage}</p>
          <p className="forge-live-phase">{forgePhase.replace(/_/g, ' ')}</p>
          <div className="progress-track"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
          <div className="step-list">
            {FORGE_STEPS.map((step, index) => (
              <span key={step.label} className={index <= activeForgeStep ? 'done' : ''}>{step.label}</span>
            ))}
          </div>
          {(forgeDurationHint || forgePhase === 'assets' || progress >= 42) && (
            <p className="forge-duration-hint">
              {forgeDurationHint || 'Generating custom art takes a while — hang tight while the artist agent paints your game.'}
            </p>
          )}
        </div>
      )}

      {studioTab === 'create' && phase === 'preview' && (
        <div className="preview-panel">
          <div className="preview-toolbar">
            <button onClick={() => setShowTools((value) => !value)}><Wand2 size={16} /> Modify</button>
            <button><ImageIcon size={16} /> Swap Art</button>
            <button><Pause size={16} /> Test</button>
          </div>
          <div className="preview-game">
            <iframe
              title="Preview game"
              src={previewHtml || !fallbackGame ? undefined : getGameUrl(fallbackGame)}
              srcDoc={previewHtml || undefined}
            />
          </div>
          <div className="publish-bar">
            <button onClick={() => setPhase('idle')}>Keep Editing</button>
            <button className="primary" disabled={!fallbackGame} onClick={() => fallbackGame && onOpenGame(fallbackGame)}><Play size={16} fill="currentColor" /> Publish</button>
          </div>
        </div>
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

function ConnectScreen({
  creators,
  onOpenCreator,
  onOpenChat,
  onOpenGame,
  variant = 'desktop',
  user,
  games = [],
}: {
  creators: Creator[];
  onOpenCreator: (creator: Creator) => void;
  onOpenChat?: (creator: Creator) => void;
  onOpenGame?: (game: Game) => void;
  variant?: 'desktop' | 'mobile';
  user?: AuthUser | null;
  games?: Game[];
}) {
  const [lane, setLane] = useState<'chats' | 'requests'>('chats');
  const [selectedChat, setSelectedChat] = useState<Creator | null>(creators[0] || null);
  const [chatQuery, setChatQuery] = useState('');

  useEffect(() => {
    if (!selectedChat && creators.length > 0) setSelectedChat(creators[0]);
  }, [creators, selectedChat]);

  const chatCreators = useMemo(() => {
    const q = chatQuery.trim().toLowerCase();
    const list = creators.slice(0, 24);
    if (!q) return list;
    return list.filter((creator) => `${creator.displayName || ''} ${creator.username}`.toLowerCase().includes(q));
  }, [creators, chatQuery]);

  if (variant === 'mobile') {
    return (
      <section className="mobile-connect-screen">
        <header className="mobile-connect-header">
          <div className="avatar-container">
            <img
              src={user ? avatarUrl(user.username, user.avatar, 96) : '/about/icon.png'}
              alt="My Avatar"
              className="user-avatar"
            />
          </div>
          <h1>gametok</h1>
          <button className="icon-button" aria-label="Notifications">
            <Bell size={21} />
          </button>
        </header>

        <div className="mobile-connect-search">
          <Search size={18} />
          <input
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="Search people and chats"
          />
        </div>

        <div className="mobile-connect-people-scroll">
          {chatCreators.map((c) => (
            <button key={c.id} className="mobile-connect-person" onClick={() => onOpenCreator(c)}>
              <div className="mobile-connect-avatar">
                <img src={avatarUrl(c.username, c.avatar, 128)} alt="" />
              </div>
              <span>{c.displayName || c.username}</span>
            </button>
          ))}
        </div>

        <div className="mobile-connect-live-banner">
          <span className="live-dot" />
          <div className="live-banner-text">
            <h3>No friends online yet</h3>
            <p>We'll show a LIVE banner here when someone you follow is in-game.</p>
          </div>
        </div>

        <div className="mobile-connect-section">
          <div className="mobile-connect-section-header">
            <h2>Friends are playing</h2>
            <button className="see-all-link">See all</button>
          </div>
          <div className="mobile-connect-games-scroll">
            {games.slice(0, 6).map((g) => (
              <button key={g.id} className="mobile-connect-game-card" onClick={() => onOpenGame?.(g)}>
                <div className="mobile-connect-game-thumb">
                  <img src={getThumbnailUrl(g)} alt="" loading="lazy" />
                </div>
                <div className="mobile-connect-game-meta">
                  <strong>{g.name}</strong>
                  <small>Trending</small>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mobile-connect-section">
          <div className="mobile-connect-section-header">
            <h2>Active Conversations</h2>
            <button className="see-all-link">See all</button>
          </div>
          <div className="mobile-connect-chats-list">
            {chatCreators.slice(0, 8).map((c) => (
              <button key={c.id} className="mobile-connect-chat-row" onClick={() => onOpenChat?.(c)}>
                <img src={avatarUrl(c.username, c.avatar, 96)} alt="" />
                <div className="mobile-connect-chat-info">
                  <strong>{c.displayName || c.username}</strong>
                  <small>Tap to message</small>
                </div>
              </button>
            ))}
            {chatCreators.length === 0 && (
              <div className="connect-empty"><p>No people found.</p></div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="messages-screen">
      <aside className="ig-inbox-sidebar">
        <header>
          <div>
            <strong>Messages</strong>
            <small>{lane === 'chats' ? `${chatCreators.length} conversations` : 'Message requests'}</small>
          </div>
          <button aria-label="New message"><Plus size={19} /></button>
        </header>
        <label className="ig-inbox-search">
          <Search size={17} />
          <input value={chatQuery} onChange={(event) => setChatQuery(event.target.value)} placeholder="Search" />
        </label>
        <nav>
          <button className={lane === 'chats' ? 'active' : ''} onClick={() => setLane('chats')}>Primary</button>
          <button className={lane === 'requests' ? 'active' : ''} onClick={() => setLane('requests')}>Requests</button>
        </nav>
        <div className="inbox-list">
          {lane === 'chats' ? (
            <>
              {chatCreators.map((creator) => (
                <button
                  className={`inbox-row ${selectedChat?.id === creator.id ? 'active' : ''}`}
                  key={creator.id}
                  onClick={() => setSelectedChat(creator)}
                >
                  <img src={avatarUrl(creator.username, creator.avatar, 96)} alt="" />
                  <span>
                    <strong>{creator.displayName || creator.username}</strong>
                    <small>@{creator.username}</small>
                  </span>
                  <i />
                </button>
              ))}
              {chatCreators.length === 0 && <EmptyListState title="No chats found" text="Try another username or display name." />}
            </>
          ) : (
            <div className="inbox-empty-panel">
              <UserPlus size={26} />
              <strong>No requests</strong>
              <span>Real message and follow requests will appear here when the backend returns them.</span>
            </div>
          )}
        </div>
      </aside>

      <main className="ig-thread-main">
        {lane === 'chats' && selectedChat ? (
          <DirectMessageSheet creator={selectedChat} embedded onOpenProfile={() => onOpenCreator(selectedChat)} />
        ) : lane === 'chats' ? (
          <EmptyListState title="No conversation selected" text="Choose a conversation to start messaging." />
        ) : (
          <div className="thread-empty-state">
            <UserPlus size={38} />
            <strong>No message requests</strong>
            <span>When someone new reaches out, their request will open here in this inbox layout.</span>
          </div>
        )}
      </main>
    </section>
  );
}

function ProfileScreen({ games, onOpenGame, onAuth, user, onLogout }: { games: Game[]; onOpenGame: (game: Game) => void; onAuth: () => void; user: AuthUser | null; onLogout: () => void }) {
  const [tab, setTab] = useState<'created' | 'played' | 'liked'>('created');
  const handle = user?.username || 'guest';
  const displayName = user?.displayName || user?.username || 'Guest Player';

  const [createdGames, setCreatedGames] = useState<Game[]>([]);
  const [playedGames, setPlayedGames] = useState<Game[]>([]);
  const [likedGamesList, setLikedGamesList] = useState<Game[]>([]);

  // Fallback: if the backend fetch fails, still show anything from the
  // top-48 trending list that we can reasonably attribute to the user.
  const localCreated = useMemo(() => user ? games.filter((game) => (
    game.creatorId === user.id
    || game.userId === user.id
    || game.createdBy === user.id
    || game.creatorUsername === user.username
  )) : [], [games, user]);

  useEffect(() => {
    if (!user?.id) {
      setCreatedGames([]);
      setPlayedGames([]);
      setLikedGamesList([]);
      return;
    }
    let mounted = true;
    (async () => {
      const [createdRes, playedRes, likedRes] = await Promise.allSettled([
        users.created(user.id, 60),
        users.played(user.id, 60),
        likesApi.userLikes(user.id),
      ]);
      if (!mounted) return;
      if (createdRes.status === 'fulfilled' && Array.isArray(createdRes.value?.games)) {
        setCreatedGames(createdRes.value.games);
      } else {
        setCreatedGames(localCreated);
      }
      if (playedRes.status === 'fulfilled' && Array.isArray(playedRes.value?.games)) {
        setPlayedGames(playedRes.value.games);
      }
      if (likedRes.status === 'fulfilled' && Array.isArray(likedRes.value?.games)) {
        setLikedGamesList(likedRes.value.games);
      }
    })();
    return () => { mounted = false; };
  }, [user?.id, localCreated]);

  const activeGames = tab === 'created' ? createdGames
    : tab === 'played' ? playedGames
    : likedGamesList;
  const likesCount = user?.likesCount ?? likedGamesList.length;
  return (
    <section className="page-scroll profile-screen">
      <header className="profile-top">
        <button className="icon-button"><UserPlus size={19} /></button>
        <strong>@{handle}</strong>
        <button className="icon-button"><Menu size={20} /></button>
      </header>

      <div className="profile-identity">
        <div className="profile-avatar">
          <img src={avatarUrl(user?.username || 'guest-player', user?.avatar, 256)} alt="" />
        </div>
        <h1>{displayName}</h1>
        <p>@{handle}</p>
        <div className="badge-row">
          <span>Creator</span>
          <span>Game Builder</span>
          <span>Early Access</span>
        </div>
      </div>

      <div className="profile-stats">
        <span><strong>{formatCount(user?.followingCount || 0)}</strong><small>Following</small></span>
        <span><strong>{formatCount(user?.followersCount || 0)}</strong><small>Followers</small></span>
        <span><strong>{createdGames.length}</strong><small>Created</small></span>
        <span><strong>{formatCount(likesCount)}</strong><small>Likes</small></span>
      </div>

      <div className="profile-actions">
        {user ? (
          <button onClick={onLogout}>Log out</button>
        ) : (
          <button onClick={onAuth}>Sign in</button>
        )}
        <button><ArrowUp size={15} /> Share profile</button>
      </div>

      <div className="profile-tabs">
        {(['created', 'played', 'liked'] as const).map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'created' ? <Grid3X3 size={18} /> : item === 'played' ? <Play size={18} /> : <Heart size={18} />}
            {item}
          </button>
        ))}
      </div>

      <div className="profile-grid">
        {activeGames.map((game) => (
          <button key={`${tab}-${game.id}`} onClick={() => onOpenGame(game)}>
            <img src={getThumbnailUrl(game)} alt="" loading="lazy" onError={(e) => handleThumbError(e, game)} />
            <span><Play size={11} fill="currentColor" /> {formatCount(game.plays)}</span>
          </button>
        ))}
        {activeGames.length === 0 && (
          <EmptyListState
            title={tab === 'created' ? 'No created games yet' : `No ${tab} games yet`}
            text="This section will populate from the account backend."
          />
        )}
      </div>
    </section>
  );
}

function BottomNav({
  activeTab,
  gameDeckMode,
  hudHidden,
  paused,
  onTab,
  onPlay,
  onTogglePlay,
  onNext,
  onPrevious,
  onToggleHud,
  onHomeDeckExit,
}: {
  activeTab: Tab;
  gameDeckMode: boolean;
  hudHidden: boolean;
  paused: boolean;
  onTab: (tab: Tab) => void;
  onPlay: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleHud: () => void;
  onHomeDeckExit: () => void;
}) {
  if (gameDeckMode) {
    return (
      <nav className="bottom-nav deck-nav">
        <button onClick={onHomeDeckExit}><Home size={23} /><span>Home</span></button>
        <i />
        <div className="deck-controls">
          <button onClick={onPrevious} aria-label="Previous game"><SkipBack size={22} fill="currentColor" /></button>
          <button className="playpause" onClick={onTogglePlay} aria-label={paused ? 'Resume' : 'Pause'}>
            {paused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
          </button>
          <button onClick={onNext} aria-label="Next game"><SkipForward size={22} fill="currentColor" /></button>
        </div>
        <button className="deck-collapse" onClick={onToggleHud} aria-label="Toggle HUD">
          {hudHidden ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
        </button>
      </nav>
    );
  }

  return (
    <nav className="bottom-nav standard-nav">
      <button className={activeTab === 'home' ? 'active' : ''} onClick={() => onTab('home')}>
        <Home size={23} /><span>Home</span>
      </button>
      <button className={activeTab === 'connect' ? 'active' : ''} onClick={() => onTab('connect')}>
        <Users size={23} /><span>Connect</span>
      </button>
      <button className="play-tab" onClick={onPlay} aria-label="Play">
        <span className="play-tab-circle"><Play size={24} fill="currentColor" /></span>
      </button>
      <button className={activeTab === 'create' ? 'active' : ''} onClick={() => onTab('create')}>
        <Palette size={23} /><span>Create</span>
      </button>
      <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => onTab('profile')}>
        <User size={23} /><span>Profile</span>
      </button>
    </nav>
  );
}

function DesktopRail({
  activeTab,
  user,
  onTab,
}: {
  activeTab: Tab;
  user: AuthUser | null;
  onTab: (tab: Tab) => void;
}) {
  return <DesktopAppSidebar activeTab={activeTab} user={user} onTab={onTab} />;
}

function DesktopHomeHero({
  onCreate,
  onExplore,
  onAuth,
  onPage,
}: {
  onCreate: () => void;
  onExplore: () => void;
  onAuth: (mode?: AuthMode) => void;
  onPage: (page: MarketingPage) => void;
}) {
  const [videoIndex, setVideoIndex] = useState(0);
  const [brief, setBrief] = useState('');
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVideoIndex((index) => (index + 1) % HOME_VIDEOS.length);
    }, 8500);
    return () => window.clearInterval(timer);
  }, []);

  // All hero clips are mounted and preloaded up front; we only play the active one
  // and crossfade via CSS opacity, so switching is instant with no re-fetch/pop-in.
  useEffect(() => {
    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === videoIndex) vid.play().catch(() => {});
      else vid.pause();
    });
  }, [videoIndex]);

  return (
    <section className="desktop-home-hero">
      {HOME_VIDEOS.map((src, i) => (
        <video
          key={src}
          ref={(el) => { videoRefs.current[i] = el; }}
          className={`desktop-hero-video ${i === videoIndex ? 'is-active' : ''}`}
          src={src}
          preload="auto"
          muted
          loop
          playsInline
          autoPlay={i === 0}
        />
      ))}
      <div className="desktop-hero-shade" />

      <header className="desktop-home-topbar">
        <div className="desktop-wordmark">
          <img src="/app-assets/icon.png" alt="" />
          <strong>GameTok</strong>
        </div>
        <nav>
          <button onClick={() => onPage('games')}>Games</button>
          <button onClick={() => onPage('blog')}>Blog</button>
          <button onClick={() => onPage('earn')}>Earn</button>
          <button onClick={onExplore}>Explore</button>
          <button onClick={onCreate}>Create</button>
        </nav>
        <div className="desktop-auth-actions">
          <button onClick={() => onAuth('login')}>Log in</button>
          <button onClick={() => onAuth('signup')}>Sign up</button>
        </div>
      </header>

      <div className="desktop-hero-copy">
        <span className="desktop-live-pill"><span /> New game model is live <ChevronRight size={14} /></span>
        <h1>Make any game you can imagine.</h1>
        <p>GameTok lets you build entire games and worlds by chatting with AI.</p>

        <div className="desktop-hero-composer">
          <span className="desktop-model-badge"><span /> New game model</span>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="A platformer where a ninja can double jump through glass skyscrapers..."
          />
          <div className="desktop-composer-row">
            <button aria-label="Upload image"><ImageIcon size={18} /></button>
            <button aria-label="Voice prompt"><Mic size={18} /></button>
            <span>{brief.length}/500</span>
            <button className="primary" onClick={onCreate}>
              Create game
            </button>
          </div>
        </div>

        <div className="desktop-proof-bar">
          <span>Featured in <strong>PC GAMER</strong></span>
          <span>Presented at <strong>AFRO EXPO 2026</strong></span>
          <span><Users size={14} /> <strong>30,000+</strong> AI game builders</span>
        </div>
      </div>
    </section>
  );
}

function DesktopPlayHome({
  user,
  game,
  games,
  index,
  liked,
  saved,
  following,
  feedMotion,
  onTab,
  onNext,
  onPrevious,
  onOpenModal,
  onOpenCreator,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
}: {
  user: AuthUser;
  game: Game;
  games: Game[];
  index: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
  feedMotion: 'next' | 'previous' | null;
  onTab: (tab: Tab) => void;
  onNext: () => void;
  onPrevious: () => void;
  onOpenModal: (modal: Modal) => void;
  onOpenCreator: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onToggleFollow: () => void;
}) {
  const creator = game.creatorDisplayName || game.creatorUsername || 'GameTok player';
  const [gameStarted, setGameStarted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setGameStarted(false);
  }, [game.id]);

  const pauseGame = () => iframeRef.current?.contentWindow?.postMessage({ type: 'gt-pause' }, '*');
  const resumeGame = () => iframeRef.current?.contentWindow?.postMessage({ type: 'gt-resume' }, '*');
  const startGame = () => { resumeGame(); setGameStarted(true); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); onNext(); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); onPrevious(); }
    };
    let wheelLock = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 20) return;
      const now = Date.now();
      if (now - wheelLock < 500) return;
      wheelLock = now;
      e.deltaY > 0 ? onNext() : onPrevious();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [onNext, onPrevious]);

  return (
    <section className="desktop-app-main desktop-play-home">
      <DesktopAppSidebar activeTab="home" user={user} onTab={onTab} />

      <main className="desktop-feed-stage">
        <div className="desktop-feed-topline">
          <span>{index + 1}/{games.length}</span>
          <strong>For You</strong>
          <button onClick={() => onOpenModal('notifications')}><Bell size={18} /></button>
        </div>

        <article className={`desktop-feed-card ${feedMotion ? `desktop-feed-motion-${feedMotion}` : ''}`}>
          <iframe
            key={game.id}
            ref={iframeRef}
            className="desktop-feed-iframe"
            title={game.name}
            src={getGameUrl(game)}
            allow="autoplay; fullscreen; clipboard-write"
            onLoad={pauseGame}
          />
          {!gameStarted && (
            <div className="desktop-feed-poster">
              <img src={getThumbnailUrl(game)} alt="" onError={e => handleThumbError(e, game)} />
              <button className="desktop-feed-play" aria-label={`Play ${game.name}`} onClick={startGame}>
                <Play size={48} fill="currentColor" />
              </button>
              <span className="desktop-feed-plays"><Play size={12} fill="currentColor" /> {formatCount(game.plays)}</span>
            </div>
          )}
        </article>

        <div className="desktop-feed-creator" onClick={onOpenCreator} role="button" tabIndex={0}>
          <img src={avatarUrl(game.creatorUsername || creator, game.creatorAvatar || null, 70)} alt="" />
          <span>
            <strong>{creator}</strong>
            <h2 className="desktop-feed-title">{game.name}</h2>
          </span>
          <button onClick={(event) => { event.stopPropagation(); onToggleFollow(); }}>{following ? 'Following' : 'Follow'}</button>
        </div>

        <div className="desktop-feed-controls">
          <button onClick={onPrevious} aria-label="Previous game"><ChevronUp size={34} /></button>
          <button onClick={onNext} aria-label="Next game"><ChevronDown size={34} /></button>
        </div>

        <aside className="desktop-feed-actions">
          <button onClick={() => onOpenModal('share')}><Send size={25} /><span>Share</span></button>
          <button onClick={() => onOpenModal('comments')}><MessageCircle size={25} /><span>{formatCount(game.commentsCount || 0)}</span></button>
          <button onClick={onToggleLike} className={liked ? 'active like-active' : ''}><Heart size={25} fill={liked ? 'currentColor' : 'none'} /><span>{formatCount((game.likes || 0) + (liked ? 1 : 0))}</span></button>
          <button onClick={onToggleSave} className={saved ? 'active' : ''}><Bookmark size={25} fill={saved ? 'currentColor' : 'none'} /><span>Favorite</span></button>
          <button className="desktop-feed-avatar-action" onClick={onOpenCreator}>
            <img src={avatarUrl(game.creatorUsername || creator, game.creatorAvatar || null, 64)} alt="" />
            <Plus size={18} />
          </button>
        </aside>
      </main>
    </section>
  );
}

function MarketingTopbar({
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
        <button onClick={() => onPage('blog')}>Blog</button>
        <button onClick={() => onPage('earn')}>Earn</button>
        <button onClick={onCreate}>Create</button>
      </nav>
      <div className="desktop-auth-actions">
        <button onClick={() => onAuth('login')}>Log in</button>
        <button onClick={() => onAuth('signup')}>Sign up</button>
      </div>
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
        <button onClick={() => onPage('blog')}>Blog</button>
        <button onClick={() => onPage('changelog')}>Changelog</button>
        <button onClick={() => onPage('earn')}>Earn</button>
        <button onClick={() => onPage('faq')}>FAQ</button>
        <button onClick={() => onPage('privacy')}>Privacy Policy</button>
        <button onClick={() => onPage('terms')}>Terms of Service</button>
      </nav>
      <button onClick={onCreate}>Make a game now</button>
    </footer>
  );
}

function StaticMarketingPage({
  page,
  games,
  onPage,
  onHome,
  onCreate,
  onExplore,
  onAuth,
  onOpenGame,
}: {
  page: MarketingPage;
  games: Game[];
  onPage: (page: MarketingPage) => void;
  onHome: () => void;
  onCreate: () => void;
  onExplore: () => void;
  onAuth: (mode?: AuthMode) => void;
  onOpenGame: (game: Game) => void;
}) {
  const [activePost, setActivePost] = useState<string | null>(null);
  const selectedPost = BLOG_POSTS.find((post) => post.slug === activePost);
  const pageTitle: Record<MarketingPage, string> = {
    games: 'Explore games made on GameTok',
    pricing: 'Simple pricing',
    blog: selectedPost?.title || 'Blog',
    changelog: 'Changelog',
    earn: 'Make a game. Share it. Grow.',
    faq: 'Frequently Asked Questions',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  };

  useEffect(() => {
    setActivePost(null);
  }, [page]);

  return (
    <main className="marketing-page">
      <MarketingTopbar onHome={onHome} onPage={onPage} onCreate={onCreate} onAuth={onAuth} />
      <section className="marketing-hero-band">
        <span><Sparkles size={14} /> GameTok web</span>
        <h1>{pageTitle[page]}</h1>
        <p>{marketingSubtitle(page, Boolean(selectedPost))}</p>
        <div>
          <button onClick={onCreate}><Wand2 size={16} /> Create a game</button>
          <button onClick={onExplore}><Compass size={16} /> Explore app</button>
        </div>
      </section>

      {page === 'games' && (
        <section className="marketing-grid-section">
          <div className="marketing-section-head">
            <h2>Playable community worlds</h2>
            <p>Borrowing the directory shape from competitors, but keeping the GameTok feed energy.</p>
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
        selectedPost ? (
          <article className="blog-detail">
            <button onClick={() => setActivePost(null)}><ChevronLeft size={16} /> Back to blog</button>
            <span>{selectedPost.category} · {selectedPost.date}</span>
            <h2>{selectedPost.title}</h2>
            {selectedPost.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </article>
        ) : (
          <section className="blog-list">
            {BLOG_POSTS.map((post) => (
              <button key={post.slug} onClick={() => setActivePost(post.slug)}>
                <span>{post.category} · {post.date}</span>
                <h2>{post.title}</h2>
                <p>{post.excerpt}</p>
                <small>Read post <ChevronRight size={14} /></small>
              </button>
            ))}
          </section>
        )
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

      <MarketingFooter onPage={onPage} onCreate={onCreate} />
    </main>
  );
}

function marketingSubtitle(page: MarketingPage, isPost: boolean) {
  if (isPost) return 'A GameTok field note for the playable social web.';
  if (page === 'games') return 'Discover playable games, creators, and worlds built for a social feed.';
  if (page === 'pricing') return 'Static v1 pricing cards for product storytelling. Payments come later.';
  if (page === 'blog') return 'Updates on AI game creation, playable feeds, and creator tools.';
  if (page === 'changelog') return 'Everything changing as GameTok web grows from app replica to full product.';
  if (page === 'earn') return 'A creator-growth page for sharing playable games and bringing players back.';
  if (page === 'faq') return 'Answers for builders, players, and anyone trying to understand GameTok web.';
  return 'Static v1 legal content for navigation completeness. Final review still required.';
}

function DesktopExploreScreen({
  user,
  games,
  creators,
  onTab,
  onOpenGame,
  onOpenCreator,
  onCreate,
  variant = 'desktop',
}: {
  user: AuthUser | null;
  games: Game[];
  creators: Creator[];
  onTab: (tab: Tab) => void;
  onOpenGame: (game: Game) => void;
  onOpenCreator: (creator: Creator) => void;
  onCreate: () => void;
  variant?: 'desktop' | 'mobile';
}) {
  const isMobile = variant === 'mobile';
  const [query, setQuery] = useState('');
  const [recentIds] = useState<string[]>(() => readRecentGameIds());
  const [following, setFollowing] = useState<Creator[]>([]);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) return;
    (async () => {
      try {
        const rows = await request(`/users/${user.id}/following`);
        if (!mounted) return;
        if (Array.isArray(rows)) setFollowing(rows as Creator[]);
      } catch {
        // Non-fatal — strip just falls back to suggestions only.
      }
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  const followingIds = useMemo(() => new Set(following.map((c) => c.id)), [following]);
  const suggestions = useMemo(
    () => creators.filter((c) => !followingIds.has(c.id)).slice(0, 20),
    [creators, followingIds],
  );

  const searchQ = query.trim().toLowerCase();
  const matchesQuery = (g: Game) =>
    !searchQ ||
    (g.name || '').toLowerCase().includes(searchQ) ||
    (g.creatorDisplayName || '').toLowerCase().includes(searchQ) ||
    (g.creatorUsername || '').toLowerCase().includes(searchQ);

  const continueGames = useMemo(() => {
    if (!recentIds.length) return [] as Game[];
    const byId = new Map(games.map((g) => [g.id, g]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean).filter(matchesQuery as (g: Game | undefined) => g is Game) as Game[];
  }, [games, recentIds, searchQ]);

  const trending = useMemo(
    () => [...games].filter(matchesQuery).sort((a, b) => (b.plays || 0) - (a.plays || 0)),
    [games, searchQ],
  );

  const fresh = useMemo(() => games.filter(matchesQuery), [games, searchQ]);

  return (
    <section className={`desktop-explore ${isMobile ? 'is-mobile' : 'desktop-app-main'}`}>
      {!isMobile && <DesktopAppSidebar activeTab="explore" user={user} onTab={onTab} />}
      <main className="desktop-explore-main">
        <header className="desktop-explore-header">
          <div>
            <p>GAMETOK</p>
            <h1>Explore</h1>
          </div>
          <button className="desktop-explore-create" onClick={onCreate}>
            <Wand2 size={16} /> Create
          </button>
        </header>

        <div className="desktop-explore-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games, creators, worlds"
          />
        </div>

        <DesktopExplorePeopleStrip
          following={following}
          suggestions={suggestions}
          onOpenCreator={onOpenCreator}
        />

        {continueGames.length > 0 && (
          <DesktopExploreRow title="Continue" games={continueGames} onOpenGame={onOpenGame} />
        )}
        <DesktopExploreRow title="Trending" games={trending} onOpenGame={onOpenGame} />
        <DesktopExploreRow title="New" games={fresh} onOpenGame={onOpenGame} />

        {trending.length === 0 && fresh.length === 0 && (
          <div className="desktop-explore-empty"><p>No games match that yet.</p></div>
        )}
      </main>
    </section>
  );
}

const EXPLORE_ROW_CHUNK_SIZE = 30;

function DesktopExploreRow({ title, games, onOpenGame }: { title: string; games: Game[]; onOpenGame: (game: Game) => void }) {
  if (games.length === 0) return null;
  const chunks: Game[][] = [];
  for (let i = 0; i < games.length; i += EXPLORE_ROW_CHUNK_SIZE) {
    chunks.push(games.slice(i, i + EXPLORE_ROW_CHUNK_SIZE));
  }
  return (
    <section className="desktop-explore-row">
      <h2>{title}</h2>
      {chunks.map((chunk, chunkIndex) => (
        <div className="desktop-explore-row-scroll" key={`${title}-chunk-${chunkIndex}`}>
          {chunk.map((game) => (
            <button key={`${title}-${game.id}`} className="desktop-explore-card" onClick={() => onOpenGame(game)}>
              <div className="desktop-explore-card-thumb" style={{ backgroundColor: game.color || '#111' }}>
                <img src={getThumbnailUrl(game)} alt="" loading="lazy" onError={(e) => handleThumbError(e, game)} />
              </div>
              <div className="desktop-explore-card-meta">
                <strong>{game.name}</strong>
                <small><Play size={11} fill="currentColor" /> {formatCount(game.plays)}</small>
              </div>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

function DesktopExplorePeopleStrip({
  following,
  suggestions,
  onOpenCreator,
}: {
  following: Creator[];
  suggestions: Creator[];
  onOpenCreator: (creator: Creator) => void;
}) {
  if (following.length === 0 && suggestions.length === 0) return null;
  const renderTile = (creator: Creator, kind: 'friend' | 'suggested') => (
    <button
      key={`${kind}-${creator.id}`}
      className="desktop-explore-person"
      onClick={() => onOpenCreator(creator)}
    >
      <div className="desktop-explore-person-avatar">
        <img src={avatarUrl(creator.username, creator.avatar, 128)} alt="" />
      </div>
      <strong>{creator.displayName || creator.username}</strong>
      <small>{kind === 'friend' ? `@${creator.username}` : 'Suggested'}</small>
    </button>
  );
  return (
    <section className="desktop-explore-people">
      <h2>{following.length > 0 ? 'Friends' : 'People to follow'}</h2>
      <div className="desktop-explore-people-scroll">
        {following.map((c) => renderTile(c, 'friend'))}
        {suggestions.map((c) => renderTile(c, 'suggested'))}
      </div>
    </section>
  );
}

function DesktopCreateWorkspace({
  games,
  activeTab,
  onTab,
  user,
  onAuthRequired,
}: {
  games: Game[];
  activeTab: Tab;
  onTab: (tab: Tab) => void;
  user: AuthUser | null;
  onAuthRequired: () => void;
}) {
  const [brief, setBrief] = useState('');
  const [animatedPrompt, setAnimatedPrompt] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [isDeletingPrompt, setIsDeletingPrompt] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildMessage, setBuildMessage] = useState('');
  const [buildError, setBuildError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeGameTitle, setActiveGameTitle] = useState('Untitled Dream');
  const cancelBuildRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const prompt = DESKTOP_CREATE_PROMPTS[promptIndex];
    let delay = isDeletingPrompt ? 24 : 42;

    if (!isDeletingPrompt && animatedPrompt === prompt) {
      delay = 1400;
    } else if (isDeletingPrompt && animatedPrompt === '') {
      delay = 360;
    }

    const timeout = window.setTimeout(() => {
      if (!isDeletingPrompt && animatedPrompt === prompt) {
        setIsDeletingPrompt(true);
        return;
      }

      if (isDeletingPrompt && animatedPrompt === '') {
        setPromptIndex((index) => (index + 1) % DESKTOP_CREATE_PROMPTS.length);
        setIsDeletingPrompt(false);
        return;
      }

      setAnimatedPrompt((current) => (
        isDeletingPrompt
          ? current.slice(0, -1)
          : prompt.slice(0, current.length + 1)
      ));
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [animatedPrompt, isDeletingPrompt, promptIndex]);

  const promptCards = [
    {
      label: 'Cozy',
      image: games[0] ? getThumbnailUrl(games[0]) : '/app-assets/dream-forge-hero.png',
      prompt: 'Make a cozy fruit ninja game where you slice fruit, dodge bombs, and chase combo streaks',
    },
    {
      label: 'FPS',
      image: games[1] ? getThumbnailUrl(games[1]) : '/app-assets/dream-forge-hero.png',
      prompt: 'Make a multiplayer FPS arena where players fight waves, upgrade weapons, and hold the zone',
    },
    {
      label: 'Mobile',
      image: games[2] ? getThumbnailUrl(games[2]) : '/app-assets/dream-forge-hero.png',
      prompt: 'Make a 2D endless runner where you jump through a jungle and dodge traps',
    },
    {
      label: 'Platformer',
      image: games[3] ? getThumbnailUrl(games[3]) : '/app-assets/dream-forge-hero.png',
      prompt: 'Make a swamp platformer where ninjas defeat enemies and collect power-ups',
    },
    {
      label: 'RPG',
      image: games[4] ? getThumbnailUrl(games[4]) : '/app-assets/dream-forge-hero.png',
      prompt: 'Make a fantasy RPG where every quest changes the village and unlocks new powers',
    },
  ];
  const startDreamForge = async () => {
    if (!user && !getToken()) {
      onAuthRequired();
      return;
    }

    const finalPrompt = (brief || animatedPrompt || DESKTOP_CREATE_PROMPTS[promptIndex]).trim();
    if (!finalPrompt) return;

    setIsBuilding(true);
    setBuildError(null);
    setPreviewHtml(null);
    setActiveDraftId(null);
    setActiveGameTitle('Untitled Dream');
    setBuildMessage('Starting Dream Forge...');
    try {
      const dreamJob = ai.dream(finalPrompt, [], {
        onJobStarted: () => setBuildMessage('Dream Forge queued your game...'),
        onJobProgress: ({ phase, progress, statusMessage, queuePosition }) => {
          if (statusMessage) {
            setBuildMessage(statusMessage);
          } else if (queuePosition) {
            setBuildMessage(`Queued — position ${queuePosition} in line...`);
          } else if (phase) {
            setBuildMessage(`${phase.replace(/_/g, ' ')}${typeof progress === 'number' ? ` · ${Math.round(progress)}%` : ''}`);
          }
        },
      });
      cancelBuildRef.current = dreamJob.cancelRemote || dreamJob.cancel;
      const result: any = await dreamJob.promise;
      if (result?.htmlPreview) {
        setPreviewHtml(result.htmlPreview);
        setActiveDraftId(result.draftId || result.id || null);
        setActiveGameTitle(result.title || result.name || 'Untitled Dream');
        setBuildMessage('Preview ready.');
      } else {
        setBuildMessage('Dream Forge finished.');
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setBuildMessage('Generation stopped.');
      } else {
        setBuildError(error?.message || 'Dream Forge failed.');
        setBuildMessage('');
      }
    } finally {
      setIsBuilding(false);
      cancelBuildRef.current = null;
    }
  };
  const stopDreamForge = () => {
    if (!cancelBuildRef.current) return;
    cancelBuildRef.current();
    cancelBuildRef.current = null;
    setIsBuilding(false);
    setBuildMessage('Generation stopped.');
  };
  const forgeActive = isBuilding || Boolean(previewHtml);

  return (
    <section className={`desktop-app-main desktop-create-workspace ${forgeActive ? 'desktop-forge-mode' : ''}`}>
      {forgeActive ? (
        <DesktopForgeRail onBack={() => onTab('create')} onHome={() => onTab('home')} />
      ) : (
        <DesktopAppSidebar activeTab={activeTab} user={user} onTab={onTab} />
      )}

      <div className="desktop-create-canvas">
        <div className="desktop-create-backdrop" />
        <div className="desktop-create-shade" />
        {isBuilding || previewHtml ? (
          <div className="desktop-forge-layout">
            <aside className="desktop-forge-panel">
              {previewHtml && activeDraftId ? (
                <DesktopRefinePanel
                  draftId={activeDraftId}
                  gameTitle={activeGameTitle}
                  currentSummary={brief}
                  onApplied={(result) => {
                    if (result?.htmlPreview) setPreviewHtml(result.htmlPreview);
                    if (result?.title || result?.name) setActiveGameTitle(result.title || result.name);
                  }}
                />
              ) : (
                <DesktopBuildPanel
                  prompt={brief || animatedPrompt || DESKTOP_CREATE_PROMPTS[promptIndex]}
                  status={buildError || buildMessage || 'Getting started...'}
                  error={Boolean(buildError)}
                  onStop={isBuilding ? stopDreamForge : undefined}
                />
              )}
            </aside>

            <div className="desktop-forge-stage">
              {previewHtml ? (
                <iframe
                  className="desktop-create-preview"
                  title="Dream Forge preview"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                />
              ) : (
                <div className="desktop-forge-card">
                  <ForgeDefenseStage
                    active={isBuilding}
                    prompt={brief || animatedPrompt || DESKTOP_CREATE_PROMPTS[promptIndex]}
                    message={buildMessage}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="desktop-create-content">
              <span className="desktop-live-pill"><span /> New game model is live <ChevronRight size={14} /></span>
              <h1>What game should we make now?</h1>

              <div className="desktop-create-card-row">
                {promptCards.map((card) => (
                  <button key={card.label} onClick={() => setBrief(card.prompt)}>
                    <img src={card.image} alt="" />
                    <span>{card.label}</span>
                    <strong>{card.prompt}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="desktop-create-composer">
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder={animatedPrompt || DESKTOP_CREATE_PROMPTS[0]}
              />
              <div className="desktop-create-composer-row">
                <button className="primary" onClick={startDreamForge}>
                  Create game
                </button>
              </div>
              {buildError && (
                <p className="desktop-create-status is-error">
                  {buildError}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ForgeDefenseStage({ active, prompt, message }: { active: boolean; prompt: string; message?: string }) {
  const motes = Array.from({ length: 12 }, (_, index) => index);
  const shards = Array.from({ length: 5 }, (_, index) => index);
  const spokes = Array.from({ length: 6 }, (_, index) => index);
  const compactPrompt = prompt.length > 58 ? `${prompt.slice(0, 58)}...` : prompt;
  return (
    <div className={`forge-defense-stage ${active ? 'active' : ''}`}>
      <div className="forge-defense-gradient" />
      <div className="forge-defense-shell" />
      <div className="forge-defense-vignette" />
      <div className="forge-defense-left-atmosphere" />
      <div className="forge-defense-top-atmosphere" />
      <div className="forge-defense-center-glow" />
      <div className="forge-defense-horizon-line" />
      <div className="forge-defense-horizon-glow" />
      <div className="forge-defense-ring large" />
      <div className="forge-defense-ring mid" />
      {spokes.map((index) => (
        <span key={`spoke-${index}`} className="forge-defense-spoke" style={{ transform: `rotate(${index * 30 - 75}deg)` }} />
      ))}
      <span className="forge-depth-pillar one" />
      <span className="forge-depth-pillar two" />
      <span className="forge-depth-pillar three" />
      <div className="forge-defense-halo outer" />
      <div className="forge-defense-halo mid" />
      <div className="forge-defense-bloom" />
      <div className="forge-defense-beam" />
      <div className="forge-defense-beam-core" />
      <div className="forge-defense-cross-light" />
      <div className="forge-defense-core-plate" />
      <div className="forge-defense-core-inner" />
      <div className="forge-defense-core-node" />
      <div className="forge-defense-arc" />
      <div className="forge-defense-arc soft" />
      {shards.map((index) => (
        <span key={`shard-${index}`} className={`forge-defense-shard shard-${index + 1}`} />
      ))}
      {motes.map((index) => (
        <span key={`mote-${index}`} className={`forge-defense-mote mote-${index + 1}`} />
      ))}
      <div className="forge-defense-copy">
        <span>GAME WORLD IN PROGRESS</span>
        <strong>{active ? 'Forging your world' : 'Dream Forge'}</strong>
        <small>Geometry, motion, audio, and feel are being fused into one playable world.</small>
      </div>
      <div className="forge-defense-progress">
        <div>
          <span>ASSEMBLY PROGRESS</span>
          <strong>{message || (active ? 'Waiting for backend' : 'Ready')}</strong>
        </div>
        <small>{active ? 'World layout' : 'Standby'}</small>
        <i />
      </div>
      <div className="forge-defense-prompt">
        <span>SPELL</span>
        <strong>✦</strong>
        <small>{compactPrompt}</small>
      </div>
    </div>
  );
}

function DesktopBuildPanel({
  prompt,
  status,
  error,
  onStop,
}: {
  prompt: string;
  status: string;
  error?: boolean;
  onStop?: () => void;
}) {
  const [followup, setFollowup] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const sendFollowup = () => {
    const value = followup.trim();
    if (!value) return;
    setNotes((items) => [...items, value]);
    setFollowup('');
  };

  return (
    <div className="desktop-build-panel">
      <header>
        <button aria-label="Back to create"><ChevronLeft size={18} /></button>
        <span>
          <strong>New Game</strong>
          <small>Editing now</small>
        </span>
        <ChevronDown size={16} />
      </header>

      <div className="desktop-build-thread">
        <p className="desktop-build-bubble ai">I’m starting the first build. You can add follow-ups here while the forge works.</p>
        <p className="desktop-build-bubble user">{prompt}</p>
        <p className={`desktop-build-bubble ai ${error ? 'is-error' : ''}`}>{status}</p>
        {notes.map((note) => (
          <p className="desktop-build-bubble user" key={note}>{note}</p>
        ))}
        {notes.length > 0 && (
          <p className="desktop-build-bubble ai">Got it. I’ll keep that ready for the first refine pass once the preview is available.</p>
        )}
      </div>

      <div className="desktop-build-bottom">
        <div className="desktop-build-followup">
          <textarea
            value={followup}
            onChange={(event) => setFollowup(event.target.value)}
            placeholder="Add a follow-up..."
          />
          <div>
            <button aria-label="Attach image"><ImageIcon size={16} /></button>
            <button aria-label="Attach file"><Plus size={16} /></button>
            <span><Sparkles size={15} /> Smart</span>
            <button aria-label="Voice"><Mic size={16} /></button>
            <button className="send" disabled={!followup.trim()} onClick={sendFollowup} aria-label="Send follow-up">
              <ArrowUp size={17} />
            </button>
          </div>
        </div>
        {onStop && (
          <button className="desktop-forge-stop" onClick={onStop}>
            <X size={17} /> Stop generation
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopForgeRail({ onBack, onHome }: { onBack: () => void; onHome: () => void }) {
  return (
    <aside className="desktop-forge-rail">
      <button className="forge-rail-logo" onClick={onHome} aria-label="GameTok home">
        <img src="/app-assets/icon.png" alt="" />
      </button>
      <button onClick={onBack} aria-label="Back to create"><Plus size={22} /></button>
      <i />
      <button><span>S</span></button>
      <button><span>J</span></button>
      <div className="forge-rail-bottom">
        <button aria-label="Notifications"><Bell size={17} /></button>
        <button aria-label="Profile"><User size={18} /></button>
        <strong>0</strong>
      </div>
    </aside>
  );
}

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
}: {
  activeTab: Tab;
  user: AuthUser | null;
  onTab: (tab: Tab) => void;
}) {
  const navItems: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
    { tab: 'create', label: 'Home', icon: <Home size={22} /> },
    { tab: 'explore', label: 'Explore', icon: <Compass size={22} /> },
    { tab: 'connect', label: 'Connect', icon: <Users size={22} /> },
    { tab: 'profile', label: 'Profile', icon: <User size={22} /> },
  ];
  const username = user?.displayName || user?.username || 'Player';
  return (
    <aside className="desktop-app-sidebar">
      <button className="desktop-sidebar-logo" onClick={() => onTab('home')}>
        <img src="/app-assets/icon.png" alt="" />
        <strong>GameTok</strong>
      </button>

      <button className="desktop-sidebar-play" onClick={() => onTab('home')}>
        <Play fill="currentColor" size={20} />
        Play
      </button>

      <nav className="desktop-sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.tab}
            className={activeTab === item.tab ? 'active' : ''}
            onClick={() => onTab(item.tab)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="desktop-sidebar-footer">
        <div className="desktop-sidebar-socials">
          <MessageCircle size={20} />
          <Hash size={20} />
          <Globe size={20} />
          <Grid3X3 size={20} />
        </div>
        <button className="desktop-sidebar-user" onClick={() => onTab('profile')}>
          <img src={avatarUrl(user?.username || 'gametok-player', user?.avatar || null, 80)} alt="" />
          <span>
            <strong>{username}</strong>
            <small>{user ? 'Game builder' : 'Sign in'}</small>
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
  const categories = ['Arcade', 'Puzzle', 'Action', 'Casual', 'Sports', 'Racing'];
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((game) =>
      `${game.name} ${game.description || ''} ${game.category || ''} ${game.creatorDisplayName || ''}`.toLowerCase().includes(q)
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
          {categories.map((category, index) => (
            <button key={category} onClick={() => setQuery(category)}>
              <span>{['🕹️', '🧩', '⚔️', '🎯', '🏀', '🏁'][index]}</span>
              <strong>{category}</strong>
              <small>{games.filter((game) => (game.category || '').toLowerCase().includes(category.toLowerCase())).length} games</small>
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
              <small>{game.category || 'Game'} · {formatCount(game.plays)} plays</small>
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
              <small>{game.category || 'Game'} · {formatCount(game.plays)} plays</small>
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

function CommentsSheet({ game }: { game: Game; creators: Creator[] }) {
  const [draft, setDraft] = useState('');
  const [localComments, setLocalComments] = useState<Array<{ id: string; username: string; text: string; likes: number }>>([]);
  const comments = localComments;

  const postComment = () => {
    if (!draft.trim()) return;
    setLocalComments((items) => [
      { id: `local-${Date.now()}`, username: 'guest', text: draft.trim(), likes: 0 },
      ...items,
    ]);
    setDraft('');
  };

  return (
    <div className="comments-list">
      {comments.map((comment) => (
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
      {comments.length === 0 && <EmptyListState title="No comments yet" text={`Be the first to comment on ${game.name}.`} />}
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
  const url = `https://games.gametok.co/${game.id}`;
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
        <strong>{mode === 'signup' ? '"A boss-rush arena that remixes every round"' : 'Your playable feed is waiting'}</strong>
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
