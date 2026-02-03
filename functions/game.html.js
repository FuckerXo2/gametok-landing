// Cloudflare Pages Function to dynamically set OG tags for game shares
const API_URL = 'https://gametok-backend-production.up.railway.app';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const gameId = url.searchParams.get('id') || url.searchParams.get('game');
  
  if (!gameId) {
    return context.next();
  }
  
  // Format game name from ID as fallback
  let gameName = gameId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let thumbnailUrl = `https://gametok-games.pages.dev/thumbnails/${gameId}.png`;
  
  // Try to fetch game data from API to get actual name and thumbnail
  try {
    const res = await fetch(`${API_URL}/api/games/${gameId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.game) {
        gameName = data.game.name || gameName;
        // Use API thumbnail if available (for external games), otherwise use local
        if (data.game.thumbnail) {
          thumbnailUrl = data.game.thumbnail;
        }
      }
    }
  } catch (e) {
    // Fallback to defaults
  }
  
  const pageUrl = `https://gametok-landing.pages.dev/game.html?id=${gameId}`;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Play ${gameName} on GameTOK</title>
    
    <meta name="apple-itunes-app" content="app-id=6757498584">
    
    <meta property="og:title" content="Play ${gameName} with me! 🎮">
    <meta property="og:description" content="Swipe. Play. Compete. Join me on GameTOK!">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${thumbnailUrl}">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    <meta property="og:url" content="${pageUrl}">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Play ${gameName} with me! 🎮">
    <meta name="twitter:description" content="Swipe. Play. Compete. Join me on GameTOK!">
    <meta name="twitter:image" content="${thumbnailUrl}">
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            min-height: 100vh;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { text-align: center; padding: 40px 24px; max-width: 400px; }
        .thumbnail {
            width: 120px; height: 120px; border-radius: 24px;
            margin: 0 auto 24px; box-shadow: 0 20px 60px rgba(255, 142, 83, 0.3);
            object-fit: cover; background: #222;
        }
        h1 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
        .game-name { font-size: 22px; color: #FF8E53; margin-bottom: 8px; }
        .subtitle { color: #888; font-size: 16px; margin-bottom: 32px; }
        .spinner {
            width: 24px; height: 24px; border: 3px solid #333;
            border-top-color: #FF8E53; border-radius: 50%;
            animation: spin 1s linear infinite; margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <img src="${thumbnailUrl}" alt="${gameName}" class="thumbnail" onerror="this.style.background='linear-gradient(135deg, #FF6B6B, #FF8E53)'">
        <p class="game-name">${gameName}</p>
        <h1>Play on GameTOK</h1>
        <p class="subtitle">Swipe. Play. Compete.</p>
        <div id="loading">
            <div class="spinner"></div>
            <p class="loading">Opening app...</p>
        </div>
    </div>
    <script>
        const deepLink = 'gametok://game/${gameId}';
        const appStoreUrl = 'https://apps.apple.com/app/gametok/id6757498584';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink;
        document.body.appendChild(iframe);
        setTimeout(() => { window.location.href = deepLink; }, 100);
        setTimeout(() => { if (!document.hidden) window.location.href = appStoreUrl; }, 1500);
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
