# GameTOK Landing & Web Platform

**Live Site**: https://gametok.co  
**Repository**: https://github.com/FuckerXo2/gametok-landing

This is the **web platform** for GameTOK - it includes:
- 🎮 **Web game player** - Play games directly in browser
- 🤖 **AI game maker** - Generate games using AI (admin panel)
- 🌐 **Landing pages** - Marketing site, download page, game sharing
- 📱 **Deep linking** - Smart app redirects for mobile users

---

## 📁 Project Structure

```
gametok-landing/
├── index.html          # Main landing page (marketing)
├── game.html           # Individual game player page
├── admin.html          # AI game maker admin panel
├── download.html       # App download page
├── functions/          # Cloudflare Pages Functions (API routes)
├── .well-known/        # Apple App Site Association (deep linking)
├── *.png               # Images and assets
└── ads.txt             # Ad network verification
```

---

## 🚀 Getting Started

### Prerequisites
- Git installed
- GitHub account with collaborator access
- Text editor (VS Code recommended)
- Kiro AI assistant (optional but helpful!)

### Clone the Repository

```bash
git clone https://github.com/FuckerXo2/gametok-landing.git
cd gametok-landing
```

### Local Development

This is a **static site** - no build process needed! Just open the HTML files:

```bash
# Option 1: Open directly in browser
open index.html

# Option 2: Use a local server (recommended)
python3 -m http.server 8000
# Then visit: http://localhost:8000

# Option 3: Use VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

---

## 🔧 Tech Stack

- **Frontend**: Pure HTML, CSS, JavaScript (no frameworks!)
- **Hosting**: Cloudflare Pages
- **Backend API**: https://gametok-backend-production.up.railway.app
- **Deep Linking**: Apple Universal Links, Android App Links

### Why No Framework?

- ⚡ **Blazing fast** - No build step, instant deploys
- 🎯 **Simple** - Easy for anyone to edit
- 📦 **Lightweight** - No dependencies to manage
- 🚀 **SEO-friendly** - Pure HTML for search engines

---

## 📝 Git Workflow

### Golden Rules
1. ✅ **Always pull before starting work**: `git pull origin main`
2. ✅ **Work in feature branches**, never directly on `main`
3. ✅ **Commit often** with clear messages
4. ✅ **Create Pull Requests** for review before merging
5. ✅ **Test locally** before pushing

### Step-by-Step Workflow

#### 1. Start a New Feature

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create a new branch for your feature
git checkout -b feature/update-homepage
```

#### 2. Make Your Changes

Edit the files, test locally, then:

```bash
# See what you changed
git status

# Stage your changes
git add .

# Commit with a clear message
git commit -m "Updated homepage hero section with new copy"
```

#### 3. Push Your Branch

```bash
# Push your branch to GitHub
git push origin feature/update-homepage
```

#### 4. Create a Pull Request

1. Go to https://github.com/FuckerXo2/gametok-landing
2. Click **"Compare & pull request"**
3. Add a description of your changes
4. Click **"Create pull request"**
5. Wait for review and approval

#### 5. After Merge

```bash
# Switch back to main
git checkout main

# Pull the latest changes (including your merged work)
git pull origin main

# Delete your local branch (optional cleanup)
git branch -d feature/update-homepage
```

---

## 🎨 Key Files to Edit

### `index.html` - Landing Page
The main marketing page visitors see first.

**Common edits:**
- Hero section copy
- Feature descriptions
- Call-to-action buttons
- Footer links

### `game.html` - Game Player
Where users play individual games in browser.

**Common edits:**
- Loading screen design
- App download prompts
- Social sharing metadata

### `admin.html` - AI Game Maker
Admin panel for generating games with AI.

**Common edits:**
- Form fields
- Game categories
- Admin authentication
- UI improvements

### `download.html` - App Download
Smart download page that detects iOS/Android.

**Common edits:**
- App Store links
- Download instructions
- Screenshots

---

## 🔗 Backend API Integration

The site connects to the backend API at:
```
https://gametok-backend-production.up.railway.app
```

### Key API Endpoints Used

```javascript
// Get all games
GET /api/games

// Get single game
GET /api/games/:id

// AI game generation (admin only)
POST /api/ai/generate

// Record game play
POST /api/games/:id/play
```

### Example API Call

```javascript
// Fetch games from backend
fetch('https://gametok-backend-production.up.railway.app/api/games')
  .then(res => res.json())
  .then(games => {
    console.log('Games:', games);
  });
```

---

## 🚢 Deployment

### Automatic Deployment (Cloudflare Pages)

Every push to `main` automatically deploys to production:

1. Push to `main` branch
2. Cloudflare Pages detects the change
3. Builds and deploys in ~30 seconds
4. Live at https://gametok.co

### Manual Deployment

If you need to deploy manually:

1. Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com)
2. Select **gametok-landing** project
3. Click **"Create deployment"**
4. Select branch and deploy

---

## 🐛 Troubleshooting

### "Permission denied" when pushing

You need to be added as a collaborator. Ask the repo owner to:
1. Go to Settings → Collaborators
2. Add your GitHub username

### Merge conflicts

If you get conflicts when pulling:

```bash
# Stash your changes
git stash

# Pull latest
git pull origin main

# Reapply your changes
git stash pop

# Fix conflicts in VS Code (it highlights them)
# Then commit
git add .
git commit -m "Resolved merge conflicts"
```

### Site not updating after deploy

- Clear browser cache (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
- Check Cloudflare Pages deployment logs
- Wait 1-2 minutes for CDN to update

---

## 🤖 Working with Kiro

If you're using Kiro AI assistant, you can ask it to:

- **Read this README**: `#README.md` to understand the project
- **Edit files**: "Update the hero section in index.html"
- **Create branches**: "Create a new branch for homepage updates"
- **Commit changes**: "Commit these changes with a good message"
- **Review code**: "Check if this HTML is valid"

Kiro can read this file and understand the entire project structure!

---

## 📚 Useful Git Commands

```bash
# Check current branch and status
git status

# See all branches
git branch -a

# Switch to a branch
git checkout branch-name

# Create and switch to new branch
git checkout -b feature/new-feature

# Pull latest changes
git pull origin main

# Push your branch
git push origin your-branch-name

# See commit history
git log --oneline

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all local changes (careful!)
git reset --hard HEAD
```

---

## 🎯 Common Tasks

### Adding a New Page

1. Create `new-page.html` in root directory
2. Copy structure from `index.html`
3. Update content
4. Test locally
5. Commit and push

### Updating Styles

All styles are inline in `<style>` tags in each HTML file. To update:

1. Find the `<style>` section in the HTML file
2. Edit CSS rules
3. Refresh browser to see changes
4. Commit when satisfied

### Adding Images

1. Add image file to root directory
2. Reference in HTML: `<img src="/your-image.png">`
3. Optimize images before adding (use TinyPNG.com)
4. Commit the image file

---

## 🔐 Admin Panel Access

The admin panel (`admin.html`) requires authentication.

**Default credentials** (change these!):
- Username: `admin`
- Password: `gametok2024`

To change credentials, edit the authentication logic in `admin.html`.

---

## 📱 Deep Linking Setup

The `.well-known/` folder contains Apple App Site Association files for deep linking.

When users click game links on iOS:
1. iOS checks `.well-known/apple-app-site-association`
2. If GameTOK app is installed → Opens in app
3. If not installed → Opens in browser

**Don't edit these files** unless you know what you're doing!

---

## 🆘 Need Help?

1. **Check this README** - Most answers are here
2. **Ask Kiro** - Your AI assistant can help with code
3. **Create an Issue** - On GitHub if you find bugs
4. **Ask the team** - Reach out on Slack/WhatsApp

---

## 📄 License

Proprietary - GameTOK © 2024

---

## 🎉 Quick Start Checklist

- [ ] Clone the repository
- [ ] Open in VS Code or your editor
- [ ] Test locally (open index.html in browser)
- [ ] Create a feature branch
- [ ] Make your changes
- [ ] Test again
- [ ] Commit with clear message
- [ ] Push branch to GitHub
- [ ] Create Pull Request
- [ ] Wait for review
- [ ] Celebrate when merged! 🎊

---

**Happy coding! 🚀**

If you're reading this in Kiro, you now understand the entire project structure and workflow. Feel free to ask me to help with any edits!
