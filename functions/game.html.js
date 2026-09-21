// Cloudflare Pages Function for /game.html?id=:id
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
  const url = new URL(context.request.url);
  const gameId = url.searchParams.get('id') || url.searchParams.get('game');

  if (!gameId) {
    return Response.redirect('https://gametok.co/', 302);
  }

  const userAgent = context.request.headers.get('user-agent') || '';
  const isBot = /facebookexternalhit|twitterbot|whatsapp|applebot|slackbot|discordbot|telegrambot|bingbot|googlebot/i.test(userAgent);

  // Real users: redirect immediately to the clean game feed route /game/:id
  if (!isBot) {
    return Response.redirect(`https://gametok.co/game/${encodeURIComponent(gameId)}`, 302);
  }

  // Social crawlers: render meta tags for link previews
  let gameName = gameId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let thumbnailUrl = `https://games.gametok.co/thumbnails/${encodeURIComponent(gameId)}.png`;
  let gameDesc = `Play ${gameName} on GameTOK! Swipe, play, and compete with friends.`;

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Play ${escapeHtml(gameName)} on GameTOK</title>
    <meta name="apple-itunes-app" content="app-id=6757498584, app-argument=${escapeHtml(deepLink)}">
    <meta property="og:title" content="Play ${escapeHtml(gameName)} on GameTOK 🎮">
    <meta property="og:description" content="${escapeHtml(gameDesc)}">
    <meta property="og:image" content="${escapeHtml(thumbnailUrl)}">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Play ${escapeHtml(gameName)} on GameTOK 🎮">
    <meta name="twitter:description" content="${escapeHtml(gameDesc)}">
    <meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}">
</head>
<body>
    <script>window.location.replace('/game/${encodeURIComponent(gameId)}');</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
