// GameTok Web API Service — direct port of mobile api.ts
// Shares the same Railway backend as the mobile app

export const API_URL = 'https://gametok-backend-production.up.railway.app/api';
const GAMES_HOST = 'https://games.gametok.co';
const API_ORIGIN = API_URL.replace(/\/api$/, '');

// ─── Client ID ───────────────────────────────────────────────
const getClientId = () => {
  let clientId = localStorage.getItem('clientId');
  if (!clientId) {
    clientId = `gtk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem('clientId', clientId);
  }
  return clientId;
};

// ─── Token Management ────────────────────────────────────────
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem('authToken', token);
  else localStorage.removeItem('authToken');
};

export const getToken = () => localStorage.getItem('authToken');

// ─── Request Helpers ─────────────────────────────────────────
const headers = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'X-Client-Id': getClientId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const request = async (endpoint: string, options: RequestInit = {}, timeoutMs?: number) => {
  const externalSignal = options.signal as AbortSignal | undefined;
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = timeoutMs
    ? setTimeout(() => { didTimeout = true; controller.abort(); }, timeoutMs)
    : null;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const { signal: _, ...restOptions } = options;
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...restOptions,
      headers: { ...headers(), ...(options.headers as Record<string, string> || {}) },
      signal: controller.signal,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text.trim());
    } catch (e) {
      if (!response.ok) throw new Error('Server returned invalid response');
      return null;
    }

    if (!response.ok) {
      const error: any = new Error(data.error || data.message || 'Request failed.');
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error: any) {
    if (didTimeout) {
      const timeoutError: any = new Error('Request timed out.');
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const requestJsonIfAvailable = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: headers(),
    });
    const text = await response.text();
    const trimmed = text.trim();
    if (!response.ok || !trimmed) return null;
    try { return JSON.parse(trimmed); } catch { return null; }
  } catch { return null; }
};

// ─── Auth API ────────────────────────────────────────────────
export const auth = {
  signup: async (username: string, password: string, displayName?: string, email?: string) => {
    const data = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName, email }),
    });
    setToken(data.token);
    return data;
  },
  login: async (username: string, password: string) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    return data;
  },
  oauth: async (provider: 'apple' | 'google', oauthData: any) => {
    const data = await request('/auth/oauth', {
      method: 'POST',
      body: JSON.stringify({ provider, ...oauthData }),
    });
    setToken(data.token);
    return data;
  },
  logout: async () => {
    try { await request('/auth/logout', { method: 'POST' }); } catch (e) {}
    setToken(null);
  },
  me: async () => request('/auth/me'),
  deleteAccount: async () => {
    await request('/auth/delete-account', { method: 'DELETE' });
    setToken(null);
  },
};

// ─── Users API ───────────────────────────────────────────────
export const users = {
  get: async (userId: string) => request(`/users/${userId}`),
  created: async (userId: string, limit = 30) => request(`/users/${userId}/created?limit=${limit}`),
  update: async (userId: string, data: { username?: string; displayName?: string; bio?: string; avatar?: string }) => {
    return request(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  follow: async (userId: string) => request(`/users/${userId}/follow`, { method: 'POST' }),
  followers: async (userId: string) => request(`/users/${userId}/followers`),
  following: async (userId: string) => request(`/users/${userId}/following`),
  played: async (userId: string, limit = 30) => request(`/users/${userId}/played?limit=${limit}`),
  search: async (query: string) => request(`/users/search/${encodeURIComponent(query)}`),
  recommended: async () => request('/users/recommended'),
};

// ─── Games API ───────────────────────────────────────────────
export const games = {
  list: async (limit = 10, offset = 0, options?: { sort?: string }) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (options?.sort) params.set('sort', options.sort);
    return request(`/games?${params.toString()}`);
  },
  discoverLanes: async (tab: string, limit = 12) => {
    return request(`/games/discover-lanes?tab=${tab}&limit=${limit}`);
  },
  top: async (tab: string, limit = 10) => {
    const data = await requestJsonIfAvailable(`/games/top?tab=${tab}&limit=${limit}`);
    return data || { tab, games: [] };
  },
  search: async (query: string, limit = 50) => {
    return request(`/games/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  },
  get: async (gameId: string) => request(`/games/${gameId}`),
  recordPlay: async (gameId: string) => request(`/games/${gameId}/play`, { method: 'POST' }),
};

// ─── Search API ──────────────────────────────────────────────
export const search = {
  trending: async (limit = 12) => {
    const data = await requestJsonIfAvailable(`/search/trending?limit=${limit}`);
    return data || { topics: [] };
  },
  track: async (query: string, source = 'explore') => {
    const data = await requestJsonIfAvailable('/search/track', {
      method: 'POST',
      body: JSON.stringify({ query, source }),
    });
    return data || { success: false, tracked: false };
  },
};

// ─── Scores API ──────────────────────────────────────────────
export const scores = {
  submit: async (gameId: string, score: number) => {
    return request('/scores', { method: 'POST', body: JSON.stringify({ gameId, score }) });
  },
  leaderboard: async (gameId: string, type: 'global' | 'friends' = 'global', limit = 10) => {
    return request(`/scores/leaderboard/${gameId}?type=${type}&limit=${limit}`);
  },
  userScores: async (userId: string, limit = 20) => {
    return request(`/scores/user/${userId}?limit=${limit}`);
  },
};

// ─── Likes API ───────────────────────────────────────────────
export const likes = {
  toggle: async (gameId: string) => request('/likes', { method: 'POST', body: JSON.stringify({ gameId }) }),
  check: async (gameIds: string[]) => request('/likes/check', { method: 'POST', body: JSON.stringify({ gameIds }) }),
  userLikes: async (userId: string) => request(`/likes/user/${userId}`),
};

// ─── Saved Games API (Bookmarks) ─────────────────────────────
export const savedGames = {
  toggle: async (gameId: string) => request('/saved-games', { method: 'POST', body: JSON.stringify({ gameId }) }),
  check: async (gameIds: string[]) => request('/saved-games/check', { method: 'POST', body: JSON.stringify({ gameIds }) }),
  userSaved: async (userId: string) => request(`/saved-games/user/${userId}`),
};

// ─── Feed API ────────────────────────────────────────────────
export const feed = {
  activity: async (limit = 20) => request(`/feed/activity?limit=${limit}`),
  global: async (limit = 20) => request(`/feed/global?limit=${limit}`),
};

// ─── Stories API ─────────────────────────────────────────────
export const stories = {
  list: async () => request('/stories'),
  create: async (mediaUrl: string, mediaType: 'image' | 'video' = 'image', caption?: string) => {
    return request('/stories', { method: 'POST', body: JSON.stringify({ mediaUrl, mediaType, caption }) });
  },
  view: async (storyId: string) => request(`/stories/${storyId}/view`, { method: 'POST' }),
  delete: async (storyId: string) => request(`/stories/${storyId}`, { method: 'DELETE' }),
};

// ─── Messages API ────────────────────────────────────────────
export const messages = {
  getConversations: async () => request('/conversations'),
  getConversation: async (userId: string) => request(`/conversations/${userId}`),
  send: async (data: { conversationId?: string; recipientId?: string; text?: string; gameShare?: { gameId: string } }) => {
    return request('/messages', { method: 'POST', body: JSON.stringify(data) });
  },
  markRead: async (messageId: string) => request(`/messages/${messageId}/read`, { method: 'POST' }),
};

// ─── Comments API ────────────────────────────────────────────
export const comments = {
  list: async (gameId: string, limit = 50) => request(`/comments/${gameId}?limit=${limit}`),
  create: async (gameId: string, text: string, gifUrl?: string) => {
    return request('/comments', { method: 'POST', body: JSON.stringify({ gameId, text, gifUrl }) });
  },
  like: async (commentId: string) => request(`/comments/${commentId}/like`, { method: 'POST' }),
  delete: async (commentId: string) => request(`/comments/${commentId}`, { method: 'DELETE' }),
};

// ─── Moderation API ──────────────────────────────────────────
export const moderation = {
  report: async (userId: string, reason: string, details?: string, contentType?: string, contentId?: string) => {
    return request('/report', { method: 'POST', body: JSON.stringify({ userId, reason, details, contentType, contentId }) });
  },
  block: async (userId: string) => request('/block', { method: 'POST', body: JSON.stringify({ userId }) }),
  unblock: async (userId: string) => request(`/block/${userId}`, { method: 'DELETE' }),
  getBlockedUsers: async () => request('/blocked'),
};

// ─── DreamStream AI Engine API ───────────────────────────────

export type DreamJobProgressUpdate = {
  progress?: number;
  phase?: string;
  statusMessage?: string | null;
  queuePosition?: number;
  queuedAhead?: number;
};

type DreamJobPollOptions = {
  onJobStarted?: (jobId: string) => void;
  onJobProgress?: (update: DreamJobProgressUpdate) => void;
};

function emitDreamJobProgress(statusRes: any, options?: DreamJobPollOptions) {
  if (!statusRes || statusRes.status === 'complete' || statusRes.status === 'error' || statusRes.status === 'canceled') {
    return;
  }
  options?.onJobProgress?.({
    progress: typeof statusRes.progress === 'number' ? statusRes.progress : undefined,
    phase: typeof statusRes.phase === 'string' ? statusRes.phase : undefined,
    statusMessage: statusRes.statusMessage ?? null,
    queuePosition: typeof statusRes.queuePosition === 'number' ? statusRes.queuePosition : undefined,
    queuedAhead: typeof statusRes.queuedAhead === 'number' ? statusRes.queuedAhead : undefined,
  });
}

export const ai = {
  cancelDreamJob: async (jobId: string) => request(`/ai/dream/cancel/${jobId}`, { method: 'POST' }),

  narrativeChat: async (messages: { role: 'ai' | 'user'; text: string }[]) => {
    return request('/ai/narrative/chat', { method: 'POST', body: JSON.stringify({ messages }) }, 45000);
  },

  interpretEdit: async (data: {
    instructions: string;
    gameTitle?: string;
    currentSummary?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) => {
    return request('/ai/interpret-edit', { method: 'POST', body: JSON.stringify(data) }, 45000);
  },

  dreamLabs: (prompt: string, attachments: any[] = [], options?: DreamJobPollOptions) => {
    const controller = new AbortController();
    let remoteJobId: string | null = null;

    const cancelRemoteJob = () => {
      controller.abort();
      if (remoteJobId) {
        request(`/ai/dream/cancel/${remoteJobId}`, { method: 'POST' }).catch(() => {});
      }
    };

    const promise = new Promise(async (resolve, reject) => {
      try {
        const res = await request('/ai/dream-labs', {
          method: 'POST',
          body: JSON.stringify({ prompt, attachments }),
          signal: controller.signal,
        }, 300000);

        if (!res.jobId && res.htmlPreview) { resolve(res); return; }

        const jobId = res.jobId;
        remoteJobId = jobId || null;
        if (jobId) options?.onJobStarted?.(jobId);

        const interval = setInterval(async () => {
          if (controller.signal.aborted) { clearInterval(interval); reject(new Error('aborted')); return; }
          try {
            const statusRes = await request(`/ai/dream/status/${jobId}`);
            emitDreamJobProgress(statusRes, options);
            if (statusRes.status === 'complete') { clearInterval(interval); resolve(statusRes); }
            else if (statusRes.status === 'error') { clearInterval(interval); reject(new Error(statusRes.error || 'Unknown AI error')); }
            else if (statusRes.status === 'canceled') { clearInterval(interval); reject(new Error(statusRes.error || 'Cancelled')); }
          } catch (e) {}
        }, 2000);
        controller.signal.addEventListener('abort', () => clearInterval(interval));
      } catch (err) { reject(err); }
    });

    return { promise, cancel: () => controller.abort(), cancelRemote: cancelRemoteJob };
  },

  dream: (prompt: string, attachments: any[] = [], options?: DreamJobPollOptions) => {
    const controller = new AbortController();
    let remoteJobId: string | null = null;

    const cancelRemoteJob = () => {
      controller.abort();
      if (remoteJobId) {
        request(`/ai/dream/cancel/${remoteJobId}`, { method: 'POST' }).catch(() => {});
      }
    };

    const promise = new Promise(async (resolve, reject) => {
      try {
        const res = await request('/ai/dream', {
          method: 'POST',
          body: JSON.stringify({ prompt, attachments }),
          signal: controller.signal,
        }, 300000);

        if (!res.jobId && res.htmlPreview) { resolve(res); return; }

        const jobId = res.jobId;
        remoteJobId = jobId || null;
        if (jobId) options?.onJobStarted?.(jobId);

        const interval = setInterval(async () => {
          if (controller.signal.aborted) { clearInterval(interval); reject(new Error('aborted')); return; }
          try {
            const statusRes = await request(`/ai/dream/status/${jobId}`);
            emitDreamJobProgress(statusRes, options);
            if (statusRes.status === 'complete') { clearInterval(interval); resolve(statusRes); }
            else if (statusRes.status === 'error') { clearInterval(interval); reject(new Error(statusRes.error || 'Unknown AI error')); }
            else if (statusRes.status === 'canceled') { clearInterval(interval); reject(new Error(statusRes.error || 'Cancelled')); }
          } catch (e) {}
        }, 2000);
        controller.signal.addEventListener('abort', () => clearInterval(interval));
      } catch (err) { reject(err); }
    });

    return { promise, cancel: () => controller.abort(), cancelRemote: cancelRemoteJob };
  },

  resumeDreamJob: (jobId: string, options?: Pick<DreamJobPollOptions, 'onJobProgress'>) => {
    const controller = new AbortController();
    const promise = new Promise(async (resolve, reject) => {
      try {
        const checkStatus = async () => {
          const statusRes = await request(`/ai/dream/status/${jobId}`);
          emitDreamJobProgress(statusRes, options);
          if (statusRes.status === 'complete') { resolve(statusRes); return true; }
          if (statusRes.status === 'error') { reject(new Error(statusRes.error || 'Unknown AI error')); return true; }
          if (statusRes.status === 'canceled') { reject(new Error(statusRes.error || 'Cancelled')); return true; }
          return false;
        };
        if (await checkStatus()) return;
        const interval = setInterval(async () => {
          if (controller.signal.aborted) { clearInterval(interval); reject(new Error('aborted')); return; }
          try { if (await checkStatus()) clearInterval(interval); } catch (e) {}
        }, 2000);
        controller.signal.addEventListener('abort', () => clearInterval(interval));
      } catch (err) { reject(err); }
    });
    return { promise, cancel: () => controller.abort() };
  },

  edit: (draftId: string, instructions: string, newAsset?: any, attachments: any[] = [], options?: DreamJobPollOptions) => {
    const controller = new AbortController();
    const promise = new Promise(async (resolve, reject) => {
      try {
        const res = await request('/ai/edit', {
          method: 'POST',
          body: JSON.stringify({ draftId, instructions, newAsset, attachments }),
          signal: controller.signal,
        }, 300000);
        if (!res.jobId && res.htmlPreview) { resolve(res); return; }
        const jobId = res.jobId;
        const interval = setInterval(async () => {
          if (controller.signal.aborted) { clearInterval(interval); reject(new Error('aborted')); return; }
          try {
            const statusRes = await request(`/ai/dream/status/${jobId}`);
            emitDreamJobProgress(statusRes, options);
            if (statusRes.status === 'complete') { clearInterval(interval); resolve(statusRes); }
            else if (statusRes.status === 'error') { clearInterval(interval); reject(new Error(statusRes.error || 'Unknown AI error')); }
            else if (statusRes.status === 'canceled') { clearInterval(interval); reject(new Error(statusRes.error || 'Cancelled')); }
          } catch (e) {}
        }, 2000);
        controller.signal.addEventListener('abort', () => clearInterval(interval));
      } catch (err) { reject(err); }
    });
    return { promise, cancel: () => controller.abort() };
  },

  generateAsset: async (prompt: string) => {
    return request('/ai/generate-asset', { method: 'POST', body: JSON.stringify({ prompt }) });
  },
  drafts: async () => request('/ai/drafts'),
  getDraft: async (draftId: string) => request(`/ai/drafts/${draftId}`),
  deleteDraft: async (draftId: string) => request(`/ai/drafts/${draftId}`, { method: 'DELETE' }),
  publish: async (draftId: string, title?: string, privacy?: string) => {
    return request(`/ai/publish/${draftId}`, { method: 'POST', body: JSON.stringify({ title, privacy }) });
  },
  templates: async () => request('/ai/templates'),
  getTemplate: async (templateId: string) => request(`/ai/templates/${templateId}`),
};

// ─── Thumbnail Resolution (ported from mobile utils/thumbnails.ts) ───
export function resolveGameThumbnail(thumbnail?: string | null, _gameId?: string | null, _game?: any) {
  const value = thumbnail?.trim();
  if (value) {
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    if (value.startsWith('/uploads/covers/') || value.startsWith('uploads/covers/')) {
      return `${API_ORIGIN}/${value.replace(/^\/+/, '')}`;
    }
    if (value.startsWith('/')) return `${API_ORIGIN}${value}`;
    if (value.startsWith('uploads/') || value.startsWith('covers/')) return `${API_ORIGIN}/${value}`;
    return `${GAMES_HOST}/${value.replace(/^\/+/, '')}`;
  }
  return '/app-assets/dream-forge-hero.png';
}

export function getThumbnailUrl(game: any) {
  if (!game) return '';
  return resolveGameThumbnail(game.thumbnail, game.id, game);
}

export function getGameUrl(game: any) {
  if (!game) return '';
  if (game.embedUrl) {
    const url = game.embedUrl.startsWith('/') ? `${API_ORIGIN}${game.embedUrl}` : game.embedUrl;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}gd_sdk_referrer_url=${encodeURIComponent(GAMES_HOST)}`;
  }
  return `${GAMES_HOST}/${game.id}/`;
}
