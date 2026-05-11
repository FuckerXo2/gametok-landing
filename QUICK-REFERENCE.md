# 🚀 Quick Reference Card

Keep this handy! Bookmark this page for quick access to common commands and workflows.

---

## 📦 Repository Info

- **Repo**: https://github.com/FuckerXo2/gametok-landing
- **Live Site**: https://gametok.co
- **Backend API**: https://gametok-backend-production.up.railway.app
- **Hosting**: Cloudflare Pages (auto-deploys from `main`)

---

## ⚡ Common Git Commands

```bash
# Check status
git status

# Pull latest changes
git pull origin main

# Create new branch
git checkout -b feature/my-feature

# Stage all changes
git add .

# Commit with message
git commit -m "Your message here"

# Push branch
git push origin feature/my-feature

# Switch to main
git checkout main

# Delete local branch
git branch -d feature/my-feature

# See all branches
git branch -a

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all local changes
git reset --hard HEAD
```

---

## 🔄 Standard Workflow

```bash
# 1. Start from main
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/your-feature

# 3. Make changes and test

# 4. Commit
git add .
git commit -m "Clear description"

# 5. Push
git push origin feature/your-feature

# 6. Create PR on GitHub

# 7. After merge, cleanup
git checkout main
git pull origin main
git branch -d feature/your-feature
```

---

## 📁 File Structure

```
gametok-landing/
├── index.html          # Landing page
├── game.html           # Game player
├── admin.html          # AI game maker
├── download.html       # App download
├── functions/          # API routes
├── .well-known/        # Deep linking
└── *.png               # Images
```

---

## 🎨 Key Files

| File | Purpose | Common Edits |
|------|---------|--------------|
| `index.html` | Landing page | Hero copy, features, CTAs |
| `game.html` | Game player | Loading screen, app prompts |
| `admin.html` | AI game maker | Forms, categories, UI |
| `download.html` | App download | Store links, instructions |

---

## 🌐 API Endpoints

```javascript
// Base URL
const API = 'https://gametok-backend-production.up.railway.app';

// Get all games
GET ${API}/api/games

// Get single game
GET ${API}/api/games/:id

// Record play
POST ${API}/api/games/:id/play

// AI generate (admin)
POST ${API}/api/ai/generate
```

---

## 🧪 Testing Locally

```bash
# Option 1: Direct open
open index.html

# Option 2: Python server
python3 -m http.server 8000
# Visit: http://localhost:8000

# Option 3: VS Code Live Server
# Right-click HTML → "Open with Live Server"
```

---

## 🌿 Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `design/` - UI/UX changes
- `content/` - Copy/text updates
- `docs/` - Documentation

**Examples:**
- `feature/add-game-filters`
- `fix/broken-download-link`
- `design/update-hero-colors`
- `content/update-homepage-copy`

---

## ✅ Pre-Push Checklist

- [ ] Tested in browser
- [ ] No console errors (F12)
- [ ] Mobile responsive
- [ ] Spell checked
- [ ] Clear commit message

---

## 🐛 Troubleshooting

### Can't push to GitHub
```bash
# Make sure you're on your branch, not main
git branch

# If on main, create a branch
git checkout -b feature/my-changes
```

### Merge conflicts
```bash
# Pull latest main
git checkout main
git pull origin main

# Merge into your branch
git checkout your-branch
git merge main

# Fix conflicts in VS Code
# Then commit
git add .
git commit -m "Resolved conflicts"
```

### Forgot to create branch
```bash
# Create branch from current state
git checkout -b feature/my-changes

# Your changes are now on the new branch
```

### Need to undo changes
```bash
# Undo all uncommitted changes
git reset --hard HEAD

# Undo last commit but keep changes
git reset --soft HEAD~1
```

---

## 🎯 Common Tasks

### Add a new page
1. Create `new-page.html`
2. Copy structure from `index.html`
3. Update content
4. Test locally
5. Commit and push

### Update styles
1. Find `<style>` tag in HTML file
2. Edit CSS
3. Refresh browser
4. Commit when satisfied

### Add an image
1. Optimize image (TinyPNG.com)
2. Add to root directory
3. Reference: `<img src="/image.png">`
4. Commit the image

### Update API endpoint
1. Find fetch() call in JavaScript
2. Update URL or parameters
3. Test in browser console
4. Commit changes

---

## 🔐 Admin Panel

**URL**: https://gametok.co/admin.html

**Default credentials** (change these!):
- Username: `admin`
- Password: `gametok2024`

---

## 📱 Browser Testing

Test in these browsers:
- ✅ Chrome (latest)
- ✅ Safari (latest)
- ✅ Firefox (latest)
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

---

## 🆘 Getting Help

1. Check this reference card
2. Read `README.md`
3. Ask Kiro (if using AI)
4. Create GitHub issue
5. Ask the team

---

## 🎓 Learning Resources

- [Git Cheat Sheet](https://education.github.com/git-cheat-sheet-education.pdf)
- [MDN Web Docs](https://developer.mozilla.org/)
- [CSS Tricks](https://css-tricks.com/)
- [JavaScript.info](https://javascript.info/)

---

## 📞 Important Links

- **GitHub Repo**: https://github.com/FuckerXo2/gametok-landing
- **Live Site**: https://gametok.co
- **Backend API**: https://gametok-backend-production.up.railway.app
- **Cloudflare Dashboard**: https://dash.cloudflare.com

---

## 💡 Pro Tips

1. **Commit often** - Small commits are easier to review
2. **Pull before push** - Avoid conflicts
3. **Test locally** - Don't push broken code
4. **Clear messages** - Future you will thank you
5. **Ask questions** - No question is dumb!

---

**Print this out or bookmark it! 📌**
