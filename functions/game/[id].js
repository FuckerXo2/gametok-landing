// Cloudflare Pages Function to serve the GameTOK website SPA with dynamic OG tags for /game/:id
const API_URL = 'https://gametok-backend-267787411422.us-central1.run.app';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function onRequest(context) {
  const gameId = context.params.id;
  const url = new URL(context.request.url);

  // Fetch index.html from Cloudflare Pages static assets
  let html = '';
  try {
    const assetRes = await context.env.ASSETS.fetch(new URL('/index.html', url));
    if (assetRes.ok) {
      html = await assetRes.text();
    }
  } catch (e) {
    // Fallback
  }

  if (!html) {
    return context.next();
  }

  if (!gameId) {
    return new Response(html, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  // Fallback defaults
  let gameName = gameId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let thumbnailUrl = `https://games.gametok.co/thumbnails/${encodeURIComponent(gameId)}.png`;
  let gameDesc = `Play ${gameName} on GameTOK! Swipe, play, and compete with friends.`;

  // Fetch real game metadata for rich social previews (iMessage, WhatsApp, Twitter, etc.)
  try {
    const res = await fetch(`${API_URL}/api/games/${encodeURIComponent(gameId)}`);
    if (res.ok) {
      const data = await res.json();
      const game = data.game || data;
      if (game && game.id) {
        if (game.name) gameName = game.name;
        if (game.description) gameDesc = game.description;
        if (game.thumbnail) thumbnailUrl = game.thumbnail;
      }
    }
  } catch (e) {}

  // an invite link (?with=<player>&from=<name>): the preview says who's asking
  const from = (url.searchParams.get('from') || '').replace(/[^\w .#-]/g, '').slice(0, 20).trim();
  const pageUrl = `https://gametok.co/game/${encodeURIComponent(gameId)}${url.search}`;
  const title = from ? `${from} invited you to play ${gameName} 🎮` : `Play ${gameName} on GameTok 🎮`;
  const desc = from ? `Tap to join their party. ${gameDesc} No download.` : `${gameDesc} Tap to play — no download.`;

  // Previews read the first tags they find, so the homepage's own title, description, canonical
  // and og:/twitter: tags come out before the game's go in.
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta[^>]+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*|description|apple-itunes-app)["'][^>]*>/gi, '');

  const ogTags = `
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(pageUrl)}">
    <meta name="description" content="${escapeHtml(desc)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="GameTok">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(desc)}">
    <meta property="og:image" content="${escapeHtml(thumbnailUrl)}">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(desc)}">
    <meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}">
  `;
  html = html.replace('</head>', `${ogTags}\n</head>`);

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=300' },
  });
}
