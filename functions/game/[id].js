// Cloudflare Pages Function to serve the GameTOK website SPA with dynamic OG tags for /game/:id
const API_URL = 'https://gametok-backend.onrender.com';

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
      if (data.game) {
        if (data.game.name) gameName = data.game.name;
        if (data.game.description) gameDesc = data.game.description;
        if (data.game.thumbnail) thumbnailUrl = data.game.thumbnail;
      }
    }
  } catch (e) {}

  const pageUrl = `https://gametok.co/game/${encodeURIComponent(gameId)}`;
  const deepLink = `gametok://game/${encodeURIComponent(gameId)}`;

  // Inject game-specific title and meta tags into index.html
  const ogTags = `
    <title>Play ${escapeHtml(gameName)} on GameTOK</title>
    <meta name="apple-itunes-app" content="app-id=6757498584, app-argument=${escapeHtml(deepLink)}">
    <meta property="og:title" content="Play ${escapeHtml(gameName)} on GameTOK 🎮">
    <meta property="og:description" content="${escapeHtml(gameDesc)}">
    <meta property="og:image" content="${escapeHtml(thumbnailUrl)}">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Play ${escapeHtml(gameName)} on GameTOK 🎮">
    <meta name="twitter:description" content="${escapeHtml(gameDesc)}">
    <meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}">
  `;

  // Replace default title and insert tags
  if (html.includes('<title>')) {
    html = html.replace(/<title>.*?<\/title>/, ogTags);
  } else {
    html = html.replace('</head>', `${ogTags}\n</head>`);
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
