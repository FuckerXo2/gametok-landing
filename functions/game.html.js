// Cloudflare Pages Function to dynamically render game player with rich OG tags
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
    return context.next();
  }
  
  // Format game name from ID as fallback
  let gameName = gameId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let thumbnailUrl = `https://games.gametok.co/thumbnails/${encodeURIComponent(gameId)}.png`;
  let gameDesc = `Play ${gameName} on GameTOK! Swipe, play, and compete with friends.`;
  let embedUrl = `https://games.gametok.co/${encodeURIComponent(gameId)}/`;
  let orientation = 'portrait';
  let creatorName = '';
  
  // Try to fetch game data from backend API
  try {
    const res = await fetch(`${API_URL}/api/games/${encodeURIComponent(gameId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.game) {
        if (data.game.name) gameName = data.game.name;
        if (data.game.description) gameDesc = data.game.description;
        if (data.game.thumbnail) thumbnailUrl = data.game.thumbnail;
        if (data.game.embedUrl) embedUrl = data.game.embedUrl;
        if (data.game.orientation) orientation = data.game.orientation;
        if (data.game.creatorDisplayName || data.game.creatorUsername) {
          creatorName = data.game.creatorDisplayName || data.game.creatorUsername;
        }
      }
    }
  } catch (e) {
    // Fallback to defaults
  }
  
  const pageUrl = `https://gametok.co/game.html?id=${encodeURIComponent(gameId)}`;
  const deepLink = `gametok://game/${encodeURIComponent(gameId)}`;
  const isLandscape = orientation === 'landscape';
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Play ${escapeHtml(gameName)} on GameTOK</title>
    
    <!-- iOS Smart App Banner -->
    <meta name="apple-itunes-app" content="app-id=6757498584, app-argument=${escapeHtml(deepLink)}">
    
    <!-- Open Graph for iMessage, WhatsApp, Twitter, etc. -->
    <meta property="og:title" content="Play ${escapeHtml(gameName)} on GameTOK 🎮">
    <meta property="og:description" content="${escapeHtml(gameDesc)}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${escapeHtml(thumbnailUrl)}">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Play ${escapeHtml(gameName)} on GameTOK 🎮">
    <meta name="twitter:description" content="${escapeHtml(gameDesc)}">
    <meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}">
    
    <link rel="icon" type="image/png" href="/about/icon.png">
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            height: 100dvh;
            background: #000;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
            touch-action: manipulation;
        }

        /* Top Header Bar */
        .header-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: calc(48px + env(safe-area-inset-top, 0px));
            padding-top: env(safe-area-inset-top, 0px);
            padding-left: 14px;
            padding-right: 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(10, 10, 15, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            z-index: 100;
        }

        .brand-group {
            display: flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
            color: #fff;
            min-width: 0;
        }

        .logo-pill {
            width: 30px;
            height: 30px;
            border-radius: 9px;
            background: linear-gradient(135deg, #FF6B6B, #FF8E53);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 16px;
            color: #fff;
            flex-shrink: 0;
            box-shadow: 0 2px 10px rgba(255, 107, 107, 0.35);
        }

        .game-meta {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .game-title {
            font-size: 14px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #fff;
        }

        .game-subtitle {
            font-size: 11px;
            color: #8E8E93;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        .btn-open-app {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            background: linear-gradient(135deg, #FF6B6B, #FF8E53);
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            padding: 7px 14px;
            border-radius: 20px;
            text-decoration: none;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(255, 110, 80, 0.35);
            transition: transform 0.15s, opacity 0.15s;
        }
        .btn-open-app:active {
            transform: scale(0.96);
            opacity: 0.9;
        }

        .btn-explore {
            display: inline-flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            padding: 7px 12px;
            border-radius: 20px;
            text-decoration: none;
            transition: background 0.15s;
        }
        .btn-explore:hover {
            background: rgba(255, 255, 255, 0.16);
        }

        /* Player Stage */
        .stage-container {
            position: absolute;
            top: calc(48px + env(safe-area-inset-top, 0px));
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            overflow: hidden;
        }

        .player-wrapper {
            position: relative;
            width: 100%;
            height: 100%;
            max-width: ${isLandscape ? '100%' : '520px'};
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
        }

        iframe.game-frame {
            width: 100%;
            height: 100%;
            border: 0;
            display: block;
            background: #000;
        }

        /* Loading poster overlay before iframe loads */
        .poster-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #0d0d12;
            z-index: 10;
            transition: opacity 0.35s ease;
            pointer-events: none;
        }

        .poster-thumb {
            width: 100px;
            height: 100px;
            border-radius: 22px;
            object-fit: cover;
            box-shadow: 0 16px 40px rgba(0,0,0,0.6);
            margin-bottom: 20px;
            background: #1e1e24;
        }

        .spinner {
            width: 28px;
            height: 28px;
            border: 3px solid rgba(255,255,255,0.15);
            border-top-color: #FF8E53;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .loading-text {
            font-size: 13px;
            color: #8E8E93;
            margin-top: 14px;
        }
    </style>
</head>
<body>
    <header class="header-bar">
        <a href="https://gametok.co" class="brand-group">
            <div class="logo-pill">G</div>
            <div class="game-meta">
                <span class="game-title">${escapeHtml(gameName)}</span>
                <span class="game-subtitle">${escapeHtml(creatorName ? 'by ' + creatorName : 'GameTOK')}</span>
            </div>
        </a>
        <div class="header-actions">
            <button class="btn-open-app" id="openAppBtn" onclick="openGameInApp()">
                Open in App
            </button>
            <a href="https://gametok.co" class="btn-explore">Explore</a>
        </div>
    </header>

    <main class="stage-container">
        <div class="player-wrapper">
            <div class="poster-overlay" id="posterOverlay">
                <img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(gameName)}" class="poster-thumb" onerror="this.style.display='none'">
                <div class="spinner"></div>
                <p class="loading-text">Loading game...</p>
            </div>
            <iframe 
                id="gameIframe"
                class="game-frame"
                src="${escapeHtml(embedUrl)}"
                allow="autoplay; fullscreen; clipboard-write; gamepad; accelerometer; gyroscope"
                loading="eager"
                onload="onGameReady()"
            ></iframe>
        </div>
    </main>

    <script>
        const deepLink = ${JSON.stringify(deepLink)};
        
        function onGameReady() {
            const overlay = document.getElementById('posterOverlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.style.display = 'none'; }, 400);
            }
        }

        // Failsafe: hide overlay after 4 seconds regardless
        setTimeout(onGameReady, 4000);

        function openGameInApp() {
            window.location.href = deepLink;
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
