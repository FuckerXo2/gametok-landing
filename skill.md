---
name: gametok-publish
description: Publish any web game to GameTok (gametok.co) from the developer's GameTok account, using their personal GameTok API key.
author: GameTok Core Team
version: 2.0.0
---

# GameTok Web Game Publishing Specification (skill.md)

This skill enables any AI coding assistant (Cursor, Claude Code, Windsurf, Devin, GitHub Copilot) to adapt, package, and publish any HTML5 / WebGL / Canvas / Three.js game to **GameTok** (`https://gametok.co`).

Full human-readable docs (bridge reference, player identity, test mode, multiplayer, error codes): `https://games.gametok.co/docs/`. A complete sample game: `https://games.gametok.co/sample/`.

---

## 1. What is GameTok?

**GameTok** is the short-form mobile video and instant gaming feed (available on iOS App Store, Google Play Store, and web). Players discover and swipe through indie games vertically just like TikTok or Reels.

### Why Developers Publish to GameTok:
1. **Instant Mobile Player Distribution:** Get your game in front of players swiping through the GameTok feed.
2. **Zero Code Transfer:** You maintain 100% ownership of your game and repository.
3. **Continuous Auto-Updates:** GameTok points to your hosted URL. Every time you push an update to your website, Vercel, Netlify, or GitHub Pages, your game on GameTok updates **immediately**.
4. **Your Account, Your Games:** Every game is published to the developer's own GameTok account and managed from their dashboard.
5. **Real Analytics:** Track plays and players for each game at `https://games.gametok.co/dashboard`.

---

## 2. Authentication: the developer's GameTok API key

Publishing requires a **GameTok API key** that belongs to the developer. The game is always published to the account that owns the key.

1. The developer signs in at `https://games.gametok.co` and opens **Dashboard → Settings → API Keys → Create key**.
2. They give you the key. It starts with `gtk_live_` (publishes live games) or `gtk_test_` (test key: everything it publishes is a private draft the developer plays in the test player at the `testUrl` in the response, then clicks **Go live**). If unsure, suggest a test key first. **Ask the user for it — never invent one, and never publish without it.**
3. Keep it out of the repository: read it from an environment variable such as `GAMETOK_API_KEY` (e.g. a gitignored `.env`). Never commit it, print it in full, or put it in game code.

Every API call sends it as:
```
Authorization: Bearer $GAMETOK_API_KEY
```
A `401` response means the key is missing, wrong, or revoked — ask the user to create a new one.
A `403` asking for a username, or with `code: "AGREEMENT_REQUIRED"`, means the account hasn't finished onboarding — ask the user to sign in at `https://games.gametok.co/dashboard`, choose a username and accept the Developer Agreement (`https://games.gametok.co/agreement.html`), then retry. You cannot accept it for them.

---

## 3. Integration: The GameTok Bridge

To ensure responsive fitting and score synchronization on GameTok, inject the bridge script into the `<head>` or before `</body>` of the game's `index.html`:

```html
<script src="https://gametok.co/bridge.js"></script>
```

Optional attribute: `data-game-title="Your Game Title"` overrides `<title>` as the game's name on GameTok.

### Optional: Player identity
Players are already signed in to GameTok. `GameTok.init()` resolves `{ player: { id, name, avatar, guest }, session, mode }`; `player.id` is unique to this player in this game. If the game has a backend, send `session` to it and verify it there with `POST /api/developer/sessions/verify` (the developer's key) before trusting the player — see the docs. Don't add this unless the game needs accounts or saved progress.

### Optional: Submitting Scores & Game Over
If the game has a score or game-over state:
```javascript
if (window.GameTok) {
  window.GameTok.submitScore(score);
  window.GameTok.gameOver(score);
}
```

---

## 4. Step-by-Step Publishing Routine for AI Agents

When a user asks you to *"Publish this game to GameTok"* or *"Make this game playable on GameTok"*, follow these steps:

### Step 1: Get the API key
Check for `GAMETOK_API_KEY` in the environment. If it is not set, ask the user for their key (Section 2) and stop until you have it.

### Step 2: Detect Metadata & Project Type
1. Inspect `package.json` or `index.html` for:
   - Game Title (from `<title>` or package name)
   - Orientation: `'portrait'` (recommended) or `'landscape'`
   - Category (one of): `'arcade'`, `'action'`, `'adventure'`, `'puzzle'`, `'sports'`, `'racing'`, `'rpg'`, `'horror'`, `'visual-novel'`
2. Check if the project is already hosted online (e.g., `https://mygame.vercel.app`, `https://user.github.io/mygame`, or custom domain).

### Step 3: Inject the Bridge Script
If `index.html` does not already have `https://gametok.co/bridge.js`, insert:
```html
<script src="https://gametok.co/bridge.js"></script>
```

### Step 4: Publish to GameTok

#### Option A: Hosted Game URL (Recommended for auto-updates)
```bash
curl -s -X POST https://gametok-backend-267787411422.us-central1.run.app/api/publish \
  -H "Authorization: Bearer $GAMETOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<HOSTED_GAME_URL>",
    "title": "<GAME_TITLE>",
    "description": "<ONE_LINE_DESCRIPTION>",
    "orientation": "portrait",
    "category": "arcade"
  }'
```

#### Option B: Standalone Single-File HTML Upload
If the game is contained in a single self-contained `index.html` (send it as the JSON `html` field; multipart uploads are not supported):
```bash
jq -n --rawfile html index.html --arg title "<GAME_TITLE>" \
  '{html: $html, title: $title, orientation: "portrait", category: "arcade"}' \
| curl -s -X POST https://gametok-backend-267787411422.us-central1.run.app/api/publish \
  -H "Authorization: Bearer $GAMETOK_API_KEY" \
  -H "Content-Type: application/json" --data-binary @-
```

Publishing again with the same title updates the existing game instead of creating a new one.

### If publishing is rejected (HTTP 400)
GameTok runs automatic checks on every publish and approves the game if the required ones pass (it is shown inside an iframe on `https://gametok.co`). A rejection has `error` (what to fix), `code`, and `checks` (every check with `ok` and `detail`):

| `code` | Meaning | Fix |
|---|---|---|
| `GAME_NOT_EMBEDDABLE` | The host sends `X-Frame-Options: DENY/SAMEORIGIN` or a `Content-Security-Policy: frame-ancestors` that excludes gametok.co. | Remove `X-Frame-Options` and send `Content-Security-Policy: frame-ancestors 'self' https://gametok.co` (e.g. `vercel.json` / `netlify.toml` / `_headers`). For itch.io, publish the `html-classic.itch.zone` game URL, not the store page. Redeploy, then publish again. |
| `GAME_URL_NOT_HTTPS` | The URL (or where it redirects) is `http://`. | Serve the game over `https://`. |
| `GAME_URL_UNREACHABLE` | The URL returned an HTTP error (e.g. 404). | Make sure the game is deployed and public. |
| `GAME_URL_NOT_HTML` | The URL isn't a web page (e.g. a .zip or .js file). | Publish the URL of the page that runs the game, usually its `index.html`. |
| `GAME_HTML_INVALID` | An uploaded `html` file has no `<html>`, `<body>`, `<script>` or `<canvas>`. | Upload the game's real `index.html`. |

Successful responses list the same `checks`; recommended ones (mobile viewport tag, bridge script) never block — suggest fixing any that failed. A `200` response may also include `warnings` (e.g. the URL couldn't be reached to verify it). Show them to the user and ask them to open the GameTok link to confirm the game plays.

---

## 5. Expected API Response

```json
{
  "success": true,
  "gameId": "cyber-dash",
  "url": "https://gametok.co/game/cyber-dash",
  "shortUrl": "https://gametok.co/game/cyber-dash",
  "creator": {
    "username": "sconnor",
    "displayName": "Sarah Connor",
    "avatar": "https://..."
  },
  "dashboardUrl": "https://games.gametok.co/dashboard"
}
```

### Unpublishing (deleting) a game
```bash
curl -s -X DELETE https://gametok-backend-267787411422.us-central1.run.app/api/developer/games/<gameId> \
  -H "Authorization: Bearer $GAMETOK_API_KEY"
```
Returns `{ "success": true, "deleted": "<gameId>" }`. Only the owner's key can delete a game.

---

## 6. Completing the Task
Once published:
1. Provide the user with their live link: `https://gametok.co/game/<gameId>`.
2. Tell them to track plays and manage the game at `https://games.gametok.co/dashboard`.
3. Remind them that whenever they push updates to their hosted URL, their GameTok game updates automatically.
