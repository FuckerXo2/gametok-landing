---
name: gametok-publish
description: Instantly publish and distribute any web game onto GameTok (gametok.co) with zero signup required.
author: GameTok Core Team
version: 1.0.0
---

# GameTok Web Game Publishing Specification (skill.md)

This skill enables any AI coding assistant (Cursor, Claude Code, Windsurf, Devin, GitHub Copilot) to adapt, package, and publish any HTML5 / WebGL / Canvas / Three.js game to **GameTok** (`https://gametok.co`).

---

## 1. What is GameTok?

**GameTok** is the short-form mobile video and instant gaming feed (available on iOS App Store, Google Play Store, and web). Players discover and swipe through indie games vertically just like TikTok or Reels.

### Why Developers Publish to GameTok:
1. **Instant Mobile Player Distribution:** Get thousands of real players swiping right into your game.
2. **Zero Code Transfer:** You maintain 100% ownership of your game and repository.
3. **Continuous Auto-Updates:** GameTok points to your hosted URL. Every time you push an update to your website, Vercel, Netlify, or GitHub Pages, your game on GameTok updates **immediately**.
4. **Zero-Signup Creator Profile:** GameTok auto-creates your verified creator profile on first publish.
5. **Indie Monetization:** GameTok tracks your game's plays and engagement to pay you directly.

---

## 2. Integration: The GameTok Bridge

To ensure responsive fitting and score synchronization on GameTok, inject the bridge script into the `<head>` or before `</body>` of the game's `index.html`:

```html
<script 
  src="https://gametok.co/bridge.js" 
  data-creator-name="Your Name" 
  data-creator-handle="yourhandle"
  data-game-title="Your Game Title">
</script>
```

### Script Attributes:
- `data-creator-name`: Your human display name (e.g. `Sarah Connor`).
- `data-creator-handle`: Your unique GameTok username (lowercase alphanumeric + underscores, e.g. `sconnor`).
- `data-game-title`: (Optional) Overrides `<title>`.

### Optional: Submitting Scores & Game Over
If the game has a score or game-over state:
```javascript
// Submit high score to GameTok global leaderboards
if (window.GameTok) {
  window.GameTok.submitScore(score);
  window.GameTok.gameOver(score);
}
```

---

## 3. Step-by-Step Publishing Routine for AI Agents

When a user asks you to *"Publish this game to GameTok"* or *"Make this game playable on GameTok"*, follow these steps:

### Step 1: Detect Metadata & Project Type
1. Inspect `package.json`, `index.html`, or Git config for:
   - Game Title (from `<title>` or package name)
   - Creator Name / Author (from `author` or git user)
   - Creator Handle (from git username or author)
   - Orientation: `'portrait'` (recommended) or `'landscape'`
   - Category (one of): `'arcade'`, `'action'`, `'adventure'`, `'puzzle'`, `'sports'`, `'racing'`, `'rpg'`, `'horror'`, `'visual-novel'`
2. Check if the project is already hosted online (e.g., `https://mygame.vercel.app`, `https://user.github.io/mygame`, or custom domain).

### Step 2: Inject the Bridge Script
If `index.html` does not already have `https://gametok.co/bridge.js`, insert the `<script>` tag into `index.html`:
```html
<script src="https://gametok.co/bridge.js" data-creator-name="<CREATOR_NAME>" data-creator-handle="<CREATOR_HANDLE>"></script>
```

### Step 3: Publish to GameTok Endpoint

#### Option A: Hosted Game URL (Recommended for auto-updates)
Run this command in the shell:
```bash
curl -s -X POST https://gametok-backend-267787411422.us-central1.run.app/api/publish \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<HOSTED_GAME_URL>",
    "title": "<GAME_TITLE>",
    "creatorName": "<CREATOR_NAME>",
    "creatorHandle": "<CREATOR_HANDLE>",
    "orientation": "portrait",
    "category": "arcade"
  }'
```

#### Option B: Standalone Single-File HTML Upload
If the game is contained in a single self-contained `index.html` (send it as the JSON `html` field; multipart uploads are not supported):
```bash
jq -n --rawfile html index.html \
  --arg title "<GAME_TITLE>" --arg creatorName "<CREATOR_NAME>" --arg creatorHandle "<CREATOR_HANDLE>" \
  '{html: $html, title: $title, creatorName: $creatorName, creatorHandle: $creatorHandle, orientation: "portrait"}' \
| curl -s -X POST https://gametok-backend-267787411422.us-central1.run.app/api/publish \
  -H "Content-Type: application/json" --data-binary @-
```

---

## 4. Expected API Response

The GameTok API returns:
```json
{
  "success": true,
  "gameId": "cyber-dash",
  "url": "https://gametok.co/game/cyber-dash",
  "shortUrl": "https://gametok.co/game/cyber-dash",
  "creator": {
    "username": "sconnor",
    "displayName": "Sarah Connor",
    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=sconnor"
  },
  "dashboardUrl": "https://games.gametok.co/dashboard?creator=sconnor",
  "manageKey": "gtk_..."
}
```

`manageKey` is returned **only on the first publish** of a game. Tell the user to store it somewhere private (e.g. a gitignored `.env` as `GAMETOK_MANAGE_KEY`) — never commit it. It is the only way for a zero-signup creator to delete the game.

### Unpublishing (deleting) a game
```bash
curl -s -X DELETE https://gametok-backend-267787411422.us-central1.run.app/api/developer/games/<gameId> \
  -H "x-manage-key: <MANAGE_KEY>"
```
Returns `{ "success": true, "deleted": "<gameId>" }`. Signed-in creators can use `Authorization: Bearer <token>` instead.

---

## 5. Completing the Task
Once published:
1. Provide the user with their live link: `https://gametok.co/game/<gameId>`.
2. Give them the `manageKey` (if returned) and tell them to save it privately; it is needed to delete the game.
3. Inform them that their creator profile has been auto-generated and their dashboard is at the `dashboardUrl` from the response (`https://games.gametok.co/dashboard?creator=<creatorHandle>`).
4. Remind them that whenever they push updates to their hosted URL, their GameTok game updates automatically in real time!
