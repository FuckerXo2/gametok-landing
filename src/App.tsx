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
  UserPlus,
  Users,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { ai, auth, users, getToken, setToken } from './services/api';
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

// Google Sign-In (web). This is the SAME Google Cloud project the mobile app uses
// (its "web client id"). For GIS to work the web origin must be listed under
// "Authorized JavaScript origins" for this OAuth client in Google Cloud Console.
// Override per-environment with VITE_GOOGLE_CLIENT_ID.
const GOOGLE_WEB_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  '690098564284-9j4fj28fiqimjg8c20mn2vtjg6b70qr7.apps.googleusercontent.com';

type AuthUser = {
  id: string;
  username: string | null;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  bio?: string | null;
  verified?: boolean;
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
type ExploreTab = 'For You' | 'Games' | 'Horror' | 'Quiz' | 'Roleplay';
type CreatePhase = 'idle' | 'refining' | 'generating' | 'preview' | 'publish';
type Modal = 'comments' | 'leaderboard' | 'share' | 'auth' | 'search' | 'notifications';
type MarketingPage = 'games' | 'pricing' | 'blog' | 'changelog' | 'earn' | 'faq' | 'privacy' | 'terms';
type AuthMode = 'signup' | 'login';

type Game = {
  id: string;
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

const FALLBACK_GAMES: Game[] = [
  {
    id: 'fruit-slicer',
    name: 'Fruit Slicer',
    description: 'Swipe through flying fruit, dodge bombs, and chase combo streaks.',
    thumbnail: '/games/fruit-slicer/thumbnail.png',
    plays: 128400,
    likes: 18200,
    saves: 6800,
    commentsCount: 439,
    category: 'Arcade',
    color: '#ff5f57',
    creatorDisplayName: 'slicequeen',
    creatorUsername: 'slicequeen',
  },
  {
    id: 'hextris',
    name: 'Hextris',
    description: 'Rotate the hex, stack colors, and survive the speed ramp.',
    plays: 98000,
    likes: 12100,
    saves: 4200,
    commentsCount: 271,
    category: 'Puzzle',
    color: '#22d3ee',
    creatorDisplayName: 'hexlabs',
    creatorUsername: 'hexlabs',
  },
  {
    id: 'tomb-of-mask-1',
    name: 'Tomb of Mask',
    description: 'Dash wall to wall through traps, coins, spikes, and secret paths.',
    plays: 251900,
    likes: 31100,
    saves: 15400,
    commentsCount: 882,
    category: 'Adventure',
    color: '#a855f7',
    creatorDisplayName: 'maskmaker',
    creatorUsername: 'maskmaker',
  },
  {
    id: 'tower-blocks-3d',
    name: 'Tower Blocks 3D',
    description: 'Drop blocks with perfect timing and build into the clouds.',
    plays: 76200,
    likes: 9300,
    saves: 3900,
    commentsCount: 145,
    category: 'Casual',
    color: '#f59e0b',
    creatorDisplayName: 'buildmode',
    creatorUsername: 'buildmode',
  },
  {
    id: 'doodle-jump',
    name: 'Doodle Jump',
    description: 'Hop higher, dodge hazards, and keep the run alive.',
    plays: 64100,
    likes: 7600,
    saves: 2100,
    commentsCount: 98,
    category: 'Platformer',
    color: '#10b981',
    creatorDisplayName: 'jumpclub',
    creatorUsername: 'jumpclub',
  },
  {
    id: 'block-blast',
    name: 'Block Blast',
    description: 'Clean lines, tight grids, and one more move energy.',
    plays: 184500,
    likes: 22900,
    saves: 9700,
    commentsCount: 501,
    category: 'Puzzle',
    color: '#38bdf8',
    creatorDisplayName: 'gridwitch',
    creatorUsername: 'gridwitch',
  },
];

const FALLBACK_CREATORS: Creator[] = [
  { id: '1', username: 'dreamforge', displayName: 'Dream Forge', verified: true },
  { id: '2', username: 'arcadeabi', displayName: 'Arcade Abi', verified: true },
  { id: '3', username: 'pixelmuse', displayName: 'Pixel Muse' },
  { id: '4', username: 'speedrunner', displayName: 'Speed Runner' },
  { id: '5', username: 'quizqueen', displayName: 'Quiz Queen' },
];

const EXPLORE_TABS: ExploreTab[] = ['For You', 'Games', 'Horror', 'Quiz', 'Roleplay'];

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
};

const readStoredSet = (key: string) => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set<string>();
  }
};

const writeStoredSet = (key: string, value: Set<string>) => {
  localStorage.setItem(key, JSON.stringify([...value]));
};

const formatCount = (value?: number) => {
  const n = value || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${n}`;
};

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const generatedThumbnailUrl = (game: Game) => {
  const title = String(game.name || game.title || 'GameTok game').trim();
  const prompt = `${title}, mobile game thumbnail, stylized game scene, vibrant colors, no text, no logo, no UI`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=768&nologo=true&enhance=true&model=flux&seed=${hashSeed(game.id || title)}`;
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
  return generatedThumbnailUrl(game);
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
  if (!uri || !uri.startsWith('dicebear://')) return null;
  const raw = uri.replace('dicebear://', '');
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
  if (uri && !uri.startsWith('dicebear://')) return uri;
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
  const [games, setGames] = useState<Game[]>(FALLBACK_GAMES);
  const [creators, setCreators] = useState<Creator[]>(FALLBACK_CREATORS);
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
        if (gamesRes.status === 'fulfilled' && Array.isArray(gamesRes.value?.games) && gamesRes.value.games.length > 0) {
          setGames(gamesRes.value.games);
          setOffline(false);
        } else {
          setOffline(true);
        }
        if (creatorsRes.status === 'fulfilled' && Array.isArray(creatorsRes.value?.users) && creatorsRes.value.users.length > 0) {
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

function App() {
  const { games, creators, loading, offline } = useGameTokData();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [marketingPage, setMarketingPage] = useState<MarketingPage | null>(null);
  const [gameIndex, setGameIndex] = useState(0);
  const [hudHidden, setHudHidden] = useState(false);
  const [gameDeckMode, setGameDeckMode] = useState(true);
  const [modal, setModal] = useState<Modal | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [likedGames, setLikedGames] = useState(() => readStoredSet(STORAGE_KEYS.likedGames));
  const [savedGames, setSavedGames] = useState(() => readStoredSet(STORAGE_KEYS.savedGames));
  const [followedCreators, setFollowedCreators] = useState(() => readStoredSet(STORAGE_KEYS.followedCreators));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // Restore session from the shared backend token (same token the mobile app uses).
  useEffect(() => {
    if (!getToken()) return;
    let mounted = true;
    auth
      .me()
      .then((data: any) => {
        if (mounted && data?.user) setAuthUser(data.user);
      })
      .catch(() => {
        // Invalid/expired token — clear it so the user can sign in again.
        setToken(null);
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
  }, []);

  const activeGame = games[gameIndex % games.length] || FALLBACK_GAMES[0];

  const openGame = (game: Game) => {
    const index = games.findIndex((item) => item.id === game.id);
    setGameIndex(index >= 0 ? index : 0);
    setGameDeckMode(true);
    setHudHidden(false);
    setActiveTab('home');
    setMarketingPage(null);
    setModal(null);
  };

  const goTab = (tab: Tab) => {
    setMarketingPage(null);
    setActiveTab(tab);
    setGameDeckMode(tab === 'home');
    if (tab !== 'home') setHudHidden(false);
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

  const nextGame = () => setGameIndex((value) => (value + 1) % games.length);
  const previousGame = () => setGameIndex((value) => (value - 1 + games.length) % games.length);
  const toggleStored = (key: string, setter: Dispatch<SetStateAction<Set<string>>>, id: string) => {
    setter((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      writeStoredSet(key, next);
      return next;
    });
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
  }, [games.length, modal]);

  return (
    <div className={`gametok-shell ${activeTab === 'home' && !marketingPage ? 'home-mode' : ''} ${marketingPage ? 'marketing-mode' : ''} ${activeTab === 'create' && !marketingPage ? 'create-mode' : ''}`}>
      {!marketingPage && <div className="phone-stage">
        <main className="app-screen">
          {activeTab === 'home' && (
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
              following={followedCreators.has(activeGame.creatorUsername || activeGame.creatorDisplayName || 'anonymous')}
              onNext={nextGame}
              onPrevious={previousGame}
              onOpenModal={setModal}
              onToggleLike={() => toggleStored(STORAGE_KEYS.likedGames, setLikedGames, activeGame.id)}
              onToggleSave={() => toggleStored(STORAGE_KEYS.savedGames, setSavedGames, activeGame.id)}
              onToggleFollow={() => toggleStored(STORAGE_KEYS.followedCreators, setFollowedCreators, activeGame.creatorUsername || activeGame.creatorDisplayName || 'anonymous')}
              onOpenExplore={() => {
                setGameDeckMode(false);
                setActiveTab('explore');
              }}
            />
          )}
          {activeTab === 'explore' && (
            <ExploreScreen games={games} creators={creators} onOpenGame={openGame} onCreate={() => goTab('create')} />
          )}
          {activeTab === 'create' && <CreateScreen onOpenGame={openGame} fallbackGame={activeGame} />}
          {activeTab === 'connect' && <ConnectScreen creators={creators} games={games} onOpenGame={openGame} />}
          {activeTab === 'profile' && <ProfileScreen games={games} onOpenGame={openGame} onAuth={() => openAuth('login')} user={authUser} onLogout={handleLogout} />}
        </main>

        <BottomNav
          activeTab={activeTab}
          gameDeckMode={gameDeckMode && activeTab === 'home'}
          hudHidden={hudHidden}
          onTab={(tab) => {
            goTab(tab);
          }}
          onRestart={() => setGameIndex((value) => value)}
          onNext={nextGame}
          onPrevious={previousGame}
          onToggleHud={() => setHudHidden((value) => !value)}
          onHomeDeckExit={() => {
            setGameDeckMode(false);
            setHudHidden(false);
          }}
        />
      </div>}

      {marketingPage && (
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

      {activeTab === 'home' && !marketingPage && !authUser && (
        <DesktopHomeHero
          onCreate={() => goTab('create')}
          onExplore={() => goTab('explore')}
          onAuth={openAuth}
          onPage={goMarketingPage}
        />
      )}

      {activeTab === 'home' && !marketingPage && authUser && (
        <DesktopPlayHome
          user={authUser}
          game={activeGame}
          games={games}
          index={gameIndex}
          liked={likedGames.has(activeGame.id)}
          saved={savedGames.has(activeGame.id)}
          following={followedCreators.has(activeGame.creatorUsername || activeGame.creatorDisplayName || 'anonymous')}
          onTab={goTab}
          onNext={nextGame}
          onPrevious={previousGame}
          onOpenModal={setModal}
          onToggleLike={() => toggleStored(STORAGE_KEYS.likedGames, setLikedGames, activeGame.id)}
          onToggleSave={() => toggleStored(STORAGE_KEYS.savedGames, setSavedGames, activeGame.id)}
          onToggleFollow={() => toggleStored(STORAGE_KEYS.followedCreators, setFollowedCreators, activeGame.creatorUsername || activeGame.creatorDisplayName || 'anonymous')}
        />
      )}

      {activeTab === 'create' && !marketingPage && (
        <DesktopCreateWorkspace
          games={games}
          activeTab={activeTab}
          onTab={goTab}
          user={authUser}
          onBuild={() => openAuth('signup')}
        />
      )}

      {activeTab !== 'home' && activeTab !== 'create' && !marketingPage && (
        <DesktopRail activeTab={activeTab} user={authUser} onTab={goTab} />
      )}

      {modal && (
        <Sheet title={modalTitle(modal)} onClose={() => setModal(null)} variant={modal === 'auth' ? 'auth' : undefined}>
          {modal === 'comments' && <CommentsSheet game={activeGame} creators={creators} />}
          {modal === 'leaderboard' && <LeaderboardSheet game={activeGame} creators={creators} />}
          {modal === 'share' && <ShareSheet game={activeGame} />}
          {modal === 'auth' && <AuthSheet initialMode={authMode} onAuthed={handleAuthed} onClose={() => setModal(null)} />}
          {modal === 'search' && <SearchSheet games={games} creators={creators} onOpenGame={openGame} onCreate={() => { setModal(null); goTab('create'); }} />}
          {modal === 'notifications' && <NotificationsSheet games={games} creators={creators} onOpenGame={openGame} />}
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
  return 'Join GameTok';
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
  onNext,
  onPrevious,
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
  onNext: () => void;
  onPrevious: () => void;
  onOpenModal: (modal: Modal) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onToggleFollow: () => void;
  onOpenExplore: () => void;
}) {
  const touchStart = useRef<number | null>(null);
  const [showPreviewArt, setShowPreviewArt] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    setGameStarted(false);
    setShowPreviewArt(true);
    const timer = window.setTimeout(() => setShowPreviewArt(true), 1800);
    return () => window.clearTimeout(timer);
  }, [game.id]);

  const handleWheel = (event: React.WheelEvent) => {
    if (Math.abs(event.deltaY) < 40) return;
    event.deltaY > 0 ? onNext() : onPrevious();
  };

  return (
    <section
      className="home-feed"
      onWheel={handleWheel}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientY;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = touchStart.current - event.changedTouches[0].clientY;
        if (Math.abs(delta) > 48) delta > 0 ? onNext() : onPrevious();
        touchStart.current = null;
      }}
    >
      <div className="feed-topbar">
        <button className="icon-button" onClick={onOpenExplore} aria-label="Explore">
          <Search size={19} />
        </button>
        <div className="feed-title">
          <span className="active-feed-dot" />
          <strong>For You</strong>
        </div>
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
        <div className="game-frame">
          {gameStarted && (
            <iframe
              key={game.id}
              className="game-iframe"
              title={game.name}
              src={getGameUrl(game)}
              allow="autoplay; fullscreen; clipboard-write"
              onLoad={() => window.setTimeout(() => setShowPreviewArt(false), 900)}
            />
          )}
          <div className="thumbnail-backdrop" style={{ backgroundImage: `url(${getThumbnailUrl(game)})` }} />
          {(!gameStarted || showPreviewArt) && (
            <div className="game-preview-art">
              <img src={getThumbnailUrl(game)} alt="" />
              <strong>{game.name}</strong>
              <button onClick={() => setGameStarted(true)}><Play size={15} fill="currentColor" /> Play game</button>
            </div>
          )}
          {offline && <div className="offline-pill">Offline fallback</div>}
        </div>
      )}

      {!hudHidden && (
        <>
          <div className="feed-actions">
            <ActionButton icon={<Trophy size={22} />} label="Scores" onClick={() => onOpenModal('leaderboard')} />
            <ActionButton icon={<Share2 size={22} />} label="Share" onClick={() => onOpenModal('share')} />
            <ActionButton icon={<MessageCircle size={22} />} label={formatCount(game.commentsCount || 0)} onClick={() => onOpenModal('comments')} />
            <ActionButton active={liked} icon={<Heart size={22} fill={liked ? 'currentColor' : 'none'} />} label={formatCount((game.likes || 0) + (liked ? 1 : 0))} onClick={onToggleLike} />
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

      <div className="swipe-hint">
        <ChevronUp size={18} />
        <span>{index + 1}/{games.length}</span>
        <ChevronDown size={18} />
      </div>

      {!gameDeckMode && <div className="deck-shadow" />}
    </section>
  );
}

function ActionButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`feed-action ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );
}

function ExploreScreen({
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
  const [active, setActive] = useState<ExploreTab>('For You');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const tabbed = active === 'For You' || active === 'Games'
      ? games
      : games.filter((game) => `${game.name} ${game.category} ${game.description}`.toLowerCase().includes(active.toLowerCase()));
    if (!query.trim()) return tabbed;
    const q = query.toLowerCase();
    return tabbed.filter((game) => `${game.name} ${game.category} ${game.description}`.toLowerCase().includes(q));
  }, [active, games, query]);

  const heroGame = filtered[0] || games[0] || FALLBACK_GAMES[0];
  const sections = [
    { title: active === 'For You' ? 'Trending Now' : `${active} Picks`, games: filtered.slice(0, 10) },
    { title: 'Made For You', games: [...filtered].reverse().slice(0, 10) },
    { title: 'Creators To Watch', games: games.slice(2, 12) },
  ];

  return (
    <section className="page-scroll explore-screen">
      <header className="screen-header">
        <div>
          <p>gametok</p>
          <h2>Explore</h2>
        </div>
        <button className="icon-button"><Menu size={20} /></button>
      </header>

      <div className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games, creators, worlds" />
      </div>

      <div className="tab-strip">
        {EXPLORE_TABS.map((tab) => (
          <button key={tab} className={active === tab ? 'active' : ''} onClick={() => setActive(tab)}>
            {active === tab && <span />}
            {tab}
          </button>
        ))}
      </div>

      <div className="explore-hero" style={{ backgroundImage: `url(${active === 'For You' ? '/app-assets/dream-forge-hero.png' : getThumbnailUrl(heroGame)})` }}>
        <div className="hero-scrim" />
        <div className="hero-pill"><Sparkles size={13} /> {active === 'For You' ? 'Dream Forge' : 'Instant Play'}</div>
        <div className="explore-hero-copy">
          <h1>{active === 'For You' ? <>Make a playable <span>world.</span></> : <>{heroGame.name}<span> play now.</span></>}</h1>
          <p>{active === 'For You' ? 'You imagine it. We build it.' : heroGame.description}</p>
          <button onClick={active === 'For You' ? onCreate : () => onOpenGame(heroGame)}>
            {active === 'For You' ? <Wand2 size={16} /> : <Play size={16} fill="currentColor" />}
            {active === 'For You' ? 'Create Now' : 'Play Now'}
          </button>
        </div>
      </div>

      {active !== 'For You' && (
        <div className="chip-row">
          {['Recommend', 'Action', 'Arcade', 'Racing', 'Puzzle', 'Casual', 'Sports'].map((chip, index) => (
            <button className={index === 0 ? 'active' : ''} key={chip}>{chip}</button>
          ))}
        </div>
      )}

      {sections.map((section) => (
        <GameLane key={section.title} title={section.title} games={section.games} onOpenGame={onOpenGame} />
      ))}

      <section className="creator-section">
        <div className="section-heading">
          <h3>Recommended creators</h3>
          <button>See all</button>
        </div>
        <div className="creator-row-list">
          {creators.slice(0, 8).map((creator) => (
            <div className="creator-card" key={creator.id}>
              <img src={avatarUrl(creator.username, creator.avatar, 128)} alt="" />
              <strong>{creator.displayName || creator.username}</strong>
              <span>@{creator.username}</span>
              <button>Follow</button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function GameLane({ title, games, onOpenGame }: { title: string; games: Game[]; onOpenGame: (game: Game) => void }) {
  return (
    <section className="game-lane">
      <div className="section-heading">
        <h3>{title}</h3>
        <button>See all</button>
      </div>
      <div className="game-card-row">
        {games.map((game) => (
          <button className="poster-card" key={`${title}-${game.id}`} onClick={() => onOpenGame(game)}>
            <span className="poster" style={{ backgroundImage: `url(${getThumbnailUrl(game)})`, backgroundColor: game.color || '#111' }}>
              <span className="poster-play"><Play size={24} fill="currentColor" /></span>
              <span className="poster-stat"><Play size={10} fill="currentColor" />{formatCount(game.plays)}</span>
            </span>
            <strong>{game.name}</strong>
            <small>@{game.creatorDisplayName || game.creatorUsername || 'creator'}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function CreateScreen({ onOpenGame, fallbackGame }: { onOpenGame: (game: Game) => void; fallbackGame: Game }) {
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
    { id: 'draft-1', title: 'Neon Rhythm Rush', status: 'Playable draft', game: fallbackGame },
    { id: 'draft-2', title: 'Haunted Quiz Room', status: 'Needs polish', game: fallbackGame },
    { id: 'draft-3', title: 'Basket Dunk Lab', status: 'Prototype', game: fallbackGame },
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
                <img src={getThumbnailUrl(draft.game)} alt="" />
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
            <Home size={20} /> <span>Create</span>
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
              src={previewHtml ? undefined : getGameUrl(fallbackGame)}
              srcDoc={previewHtml || undefined}
            />
          </div>
          <div className="publish-bar">
            <button onClick={() => setPhase('idle')}>Keep Editing</button>
            <button className="primary" onClick={() => onOpenGame(fallbackGame)}><Play size={16} fill="currentColor" /> Publish</button>
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

function ConnectScreen({ creators, games, onOpenGame }: { creators: Creator[]; games: Game[]; onOpenGame: (game: Game) => void }) {
  const [lane, setLane] = useState<'chats' | 'requests' | 'activity'>('chats');
  return (
    <section className="page-scroll connect-screen">
      <header className="screen-header">
        <div>
          <p>Social</p>
          <h2>Connect</h2>
        </div>
        <button className="icon-button"><UserPlus size={20} /></button>
      </header>

      <div className="story-strip">
        <button className="story-bubble add"><Plus size={20} /><span>Story</span></button>
        {creators.map((creator) => (
          <button className="story-bubble" key={creator.id}>
            <img src={avatarUrl(creator.username, creator.avatar, 128)} alt="" />
            <span>{creator.username}</span>
          </button>
        ))}
      </div>

      <div className="segmented">
        {(['chats', 'requests', 'activity'] as const).map((item) => (
          <button key={item} className={lane === item ? 'active' : ''} onClick={() => setLane(item)}>{item}</button>
        ))}
      </div>

      {lane === 'chats' && (
        <div className="message-list">
          {creators.slice(0, 7).map((creator, index) => (
            <button className="message-row" key={creator.id}>
              <img src={avatarUrl(creator.username, creator.avatar, 128)} alt="" />
              <span>
                <strong>{creator.displayName || creator.username}</strong>
                <small>{index % 2 ? 'Sent you a game challenge' : 'Want to co-create a horror quiz?'}</small>
              </span>
              <em>{index + 1}m</em>
            </button>
          ))}
        </div>
      )}

      {lane === 'requests' && (
        <div className="request-grid">
          {creators.slice(1, 5).map((creator) => (
            <div className="request-card" key={creator.id}>
              <img src={avatarUrl(creator.username, creator.avatar, 128)} alt="" />
              <strong>{creator.displayName || creator.username}</strong>
              <span>@{creator.username}</span>
              <button>Accept</button>
            </div>
          ))}
        </div>
      )}

      {lane === 'activity' && (
        <div className="activity-list">
          {games.slice(0, 8).map((game, index) => (
            <button className="activity-row" key={game.id} onClick={() => onOpenGame(game)}>
              <span className="activity-icon">{index % 3 === 0 ? <Trophy size={17} /> : index % 3 === 1 ? <Heart size={17} /> : <Play size={17} />}</span>
              <span>
                <strong>@{game.creatorDisplayName || 'creator'}</strong>
                <small>{index % 2 ? 'liked your score in' : 'is playing'} {game.name}</small>
              </span>
              <img src={getThumbnailUrl(game)} alt="" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileScreen({ games, onOpenGame, onAuth, user, onLogout }: { games: Game[]; onOpenGame: (game: Game) => void; onAuth: () => void; user: AuthUser | null; onLogout: () => void }) {
  const [tab, setTab] = useState<'created' | 'played' | 'liked'>('created');
  const handle = user?.username || 'guest';
  const displayName = user?.displayName || user?.username || 'Guest Player';
  const activeGames = tab === 'created' ? games.slice(0, 9) : tab === 'played' ? [...games].reverse().slice(0, 9) : games.slice(2, 11);
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
        <span><strong>42</strong><small>Following</small></span>
        <span><strong>8.2K</strong><small>Followers</small></span>
        <span><strong>{games.length}</strong><small>Created</small></span>
        <span><strong>91K</strong><small>Likes</small></span>
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
          <button key={`${tab}-${game.id}`} onClick={() => onOpenGame(game)} style={{ backgroundImage: `url(${getThumbnailUrl(game)})` }}>
            <span><Play size={11} fill="currentColor" /> {formatCount(game.plays)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function BottomNav({
  activeTab,
  gameDeckMode,
  hudHidden,
  onTab,
  onRestart,
  onNext,
  onPrevious,
  onToggleHud,
  onHomeDeckExit,
}: {
  activeTab: Tab;
  gameDeckMode: boolean;
  hudHidden: boolean;
  onTab: (tab: Tab) => void;
  onRestart: () => void;
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
          <button onClick={onPrevious}><ChevronLeft size={30} /></button>
          <button className="replay" onClick={onRestart}><RefreshCw size={25} /></button>
          <button onClick={onNext}><ChevronRight size={30} /></button>
        </div>
        <button onClick={onToggleHud}>{hudHidden ? <ChevronUp size={23} /> : <ChevronDown size={23} />}</button>
      </nav>
    );
  }

  const items: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
    { tab: 'home', label: 'Home', icon: <Home size={23} /> },
    { tab: 'explore', label: 'Explore', icon: <Compass size={23} /> },
    { tab: 'create', label: 'Create', icon: <Plus size={24} /> },
    { tab: 'connect', label: 'Connect', icon: <Users size={23} /> },
    { tab: 'profile', label: 'Profile', icon: <User size={23} /> },
  ];

  return (
    <nav className="bottom-nav standard-nav">
      {items.map((item) => (
        <button key={item.tab} className={`${activeTab === item.tab ? 'active' : ''} ${item.tab === 'create' ? 'create-tab' : ''}`} onClick={() => onTab(item.tab)}>
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
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
  onTab,
  onNext,
  onPrevious,
  onOpenModal,
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
  onTab: (tab: Tab) => void;
  onNext: () => void;
  onPrevious: () => void;
  onOpenModal: (modal: Modal) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onToggleFollow: () => void;
}) {
  const creator = game.creatorDisplayName || game.creatorUsername || 'GameTok player';
  return (
    <section className="desktop-app-main desktop-play-home">
      <DesktopAppSidebar activeTab="home" user={user} onTab={onTab} />

      <main className="desktop-feed-stage">
        <div className="desktop-feed-topline">
          <span>{index + 1}/{games.length}</span>
          <strong>For You</strong>
          <button onClick={() => onOpenModal('notifications')}><Bell size={18} /></button>
        </div>

        <article className="desktop-feed-card">
          <div className="desktop-feed-card-shade" />
          <div className="desktop-feed-poster">
            <img src={getThumbnailUrl(game)} alt="" />
            <button className="desktop-feed-play" aria-label={`Play ${game.name}`}>
              <Play size={48} fill="currentColor" />
            </button>
            <span className="desktop-feed-plays"><Play size={12} fill="currentColor" /> {formatCount(game.plays)}</span>
          </div>
        </article>

        <div className="desktop-feed-creator">
          <img src={avatarUrl(game.creatorUsername || creator, game.creatorAvatar || null, 70)} alt="" />
          <span>
            <strong>{creator}</strong>
            <small>Browse their games</small>
          </span>
          <button onClick={onToggleFollow}>{following ? 'Following' : 'Follow'}</button>
        </div>

        <div className="desktop-feed-controls">
          <button onClick={onPrevious} aria-label="Previous game"><ChevronUp size={34} /></button>
          <button onClick={onNext} aria-label="Next game"><ChevronDown size={34} /></button>
        </div>

        <aside className="desktop-feed-actions">
          <button onClick={() => onOpenModal('leaderboard')}><Trophy size={25} /><span>Scores</span></button>
          <button onClick={() => onOpenModal('share')}><Send size={25} /><span>Share</span></button>
          <button onClick={() => onOpenModal('comments')}><MessageCircle size={25} /><span>{formatCount(game.commentsCount || 0)}</span></button>
          <button onClick={onToggleLike} className={liked ? 'active' : ''}><Heart size={25} fill={liked ? 'currentColor' : 'none'} /><span>{formatCount(game.likes || 0)}</span></button>
          <button onClick={onToggleSave} className={saved ? 'active' : ''}><Bookmark size={25} fill={saved ? 'currentColor' : 'none'} /><span>Favorite</span></button>
          <button className="desktop-feed-avatar-action" onClick={() => onTab('profile')}>
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
                <img src={getThumbnailUrl(game)} alt="" />
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

function DesktopCreateWorkspace({
  games,
  activeTab,
  onTab,
  user,
  onBuild,
}: {
  games: Game[];
  activeTab: Tab;
  onTab: (tab: Tab) => void;
  user: AuthUser | null;
  onBuild: () => void;
}) {
  const [brief, setBrief] = useState('');
  const [animatedPrompt, setAnimatedPrompt] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [isDeletingPrompt, setIsDeletingPrompt] = useState(false);
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
      image: getThumbnailUrl(games[0] || FALLBACK_GAMES[0]),
      prompt: 'Make a cozy fruit ninja game where you slice fruit, dodge bombs, and chase combo streaks',
    },
    {
      label: 'FPS',
      image: getThumbnailUrl(games[1] || FALLBACK_GAMES[1]),
      prompt: 'Make a multiplayer FPS arena where players fight waves, upgrade weapons, and hold the zone',
    },
    {
      label: 'Mobile',
      image: getThumbnailUrl(games[2] || FALLBACK_GAMES[2]),
      prompt: 'Make a 2D endless runner where you jump through a jungle and dodge traps',
    },
    {
      label: 'Platformer',
      image: getThumbnailUrl(games[3] || FALLBACK_GAMES[3]),
      prompt: 'Make a swamp platformer where ninjas defeat enemies and collect power-ups',
    },
    {
      label: 'RPG',
      image: getThumbnailUrl(games[4] || FALLBACK_GAMES[4]),
      prompt: 'Make a fantasy RPG where every quest changes the village and unlocks new powers',
    },
  ];
  return (
    <section className="desktop-app-main desktop-create-workspace">
      <DesktopAppSidebar activeTab={activeTab} user={user} onTab={onTab} />

      <div className="desktop-create-canvas">
        <div className="desktop-create-backdrop" />
        <div className="desktop-create-shade" />
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
            <button aria-label="Add image"><ImageIcon size={18} /></button>
            <button aria-label="Attach reference"><Plus size={18} /></button>
            <button className="smart"><Sparkles size={18} /> Smart</button>
            <span>{brief.length}/500</span>
            <button className="plan"><Sparkles size={18} /> Plan</button>
            <button aria-label="Voice prompt"><Mic size={18} /></button>
            <button className="primary" onClick={onBuild}>Create game</button>
          </div>
        </div>
      </div>
    </section>
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
    { tab: 'home', label: 'Home', icon: <Home size={22} /> },
    { tab: 'explore', label: 'Explore', icon: <Compass size={22} /> },
    { tab: 'connect', label: 'Connect', icon: <Users size={22} /> },
    { tab: 'create', label: 'Create', icon: <Plus size={22} /> },
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
              <small>{Math.max(3, games.filter((game) => (game.category || '').toLowerCase().includes(category.toLowerCase())).length)} games</small>
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
            <img src={getThumbnailUrl(game)} alt="" />
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

function NotificationsSheet({ games, creators, onOpenGame }: { games: Game[]; creators: Creator[]; onOpenGame: (game: Game) => void }) {
  const items = games.slice(0, 8).map((game, index) => ({
    id: `${game.id}-${index}`,
    game,
    creator: creators[index % Math.max(creators.length, 1)] || FALLBACK_CREATORS[0],
    text: index % 3 === 0 ? 'sent you a score challenge' : index % 3 === 1 ? 'liked your run' : 'published a new game',
  }));

  return (
    <div className="notification-list">
      {items.map((item, index) => (
        <button key={item.id} onClick={() => onOpenGame(item.game)}>
          <span className="notification-icon">
            {index % 3 === 0 ? <Trophy size={18} /> : index % 3 === 1 ? <Heart size={18} /> : <Gamepad2 size={18} />}
          </span>
          <span>
            <strong>@{item.creator.username}</strong>
            <small>{item.text} · {item.game.name}</small>
          </span>
          <img src={getThumbnailUrl(item.game)} alt="" />
        </button>
      ))}
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
  variant?: 'auth';
}) {
  return (
    <div className={`sheet-backdrop ${variant === 'auth' ? 'auth-backdrop' : ''}`}>
      <button className="sheet-clickout" onClick={onClose} aria-label="Close" />
      <section className={`bottom-sheet ${variant === 'auth' ? 'auth-sheet-shell' : ''}`}>
        {variant !== 'auth' && (
          <>
            <div className="sheet-grabber" />
            <header>
              <h2>{title}</h2>
              <button className="icon-button" onClick={onClose}><X size={20} /></button>
            </header>
          </>
        )}
        {children}
      </section>
    </div>
  );
}

function CommentsSheet({ game, creators }: { game: Game; creators: Creator[] }) {
  const [draft, setDraft] = useState('');
  const [localComments, setLocalComments] = useState<Array<{ id: string; username: string; text: string; likes: number }>>([]);
  const comments = [
    ...localComments,
    ...creators.slice(0, 6).map((creator, index) => ({
      id: creator.id,
      username: creator.username,
      text: index % 2 ? `The polish on ${game.name} is wild.` : 'This needs a speedrun leaderboard immediately.',
      likes: Math.max(0, 18 - index * 3),
    })),
  ];

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
      <div className="comment-composer">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') postComment(); }} placeholder="Add a comment..." />
        <button onClick={postComment}><Send size={17} /></button>
      </div>
    </div>
  );
}

function LeaderboardSheet({ game, creators }: { game: Game; creators: Creator[] }) {
  const rows = [
    { id: 'guest', username: 'guest', score: Math.round((game.plays || 12000) / 1.7), current: true },
    ...creators.slice(0, 7).map((creator, index) => ({
      id: creator.id,
      username: creator.username,
      score: Math.round((game.plays || 9000) / (index + 2)),
      current: false,
    })),
  ].sort((a, b) => b.score - a.score);

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
      <img src={getThumbnailUrl(game)} alt="" />
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
          window.google.accounts.id.renderButton(ref.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'center',
            width: 420,
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
  const [emailExpanded, setEmailExpanded] = useState(false);
  const socialAvatars = ['max_arcade', 'nova_builder', 'pixelmaya'];

  useEffect(() => {
    setMode(initialMode);
    setEmailExpanded(false);
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
      setError('Username and password are required.');
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

      <GoogleSignInButton onCredential={handleGoogleCredential} />

      <div className="auth-divider"><span>or</span></div>

      {!emailExpanded ? (
        <button className="auth-email-toggle" onClick={() => setEmailExpanded(true)}>
          Continue with email
        </button>
      ) : (
        <div className="auth-email-fields">
          <label className="auth-input-row">
            <User size={17} />
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
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
      )}

      {error && <small className="auth-error">{error}</small>}

      <div className="auth-legal">
        By continuing, you agree to our <button>Terms</button> and <button>Privacy Policy</button>
      </div>

      <button
        className="auth-toggle"
        onClick={() => {
          setMode(mode === 'signup' ? 'login' : 'signup');
          setEmailExpanded(false);
          setError('');
        }}
      >
        {mode === 'signup' ? 'Already have an account? Log in' : 'Need an account? Sign up'}
      </button>
    </div>
  );
}

export default App;
