# 🎯 New Team Member Onboarding

Welcome to the GameTOK team! Follow this checklist to get set up.

---

## ✅ Day 1: Setup (30 minutes)

### 1. GitHub Access
- [ ] Create GitHub account (if you don't have one)
- [ ] Accept collaborator invitation email
- [ ] Verify you can access https://github.com/FuckerXo2/gametok-landing

### 2. Install Tools
- [ ] Install Git: https://git-scm.com/downloads
- [ ] Install VS Code: https://code.visualstudio.com/
- [ ] Install VS Code extensions:
  - Live Server (for local testing)
  - Prettier (for code formatting)
  - GitLens (for Git visualization)

### 3. Clone Repository
```bash
git clone https://github.com/FuckerXo2/gametok-landing.git
cd gametok-landing
```

### 4. Test Locally
- [ ] Open `index.html` in browser
- [ ] Open `game.html` in browser
- [ ] Open `admin.html` in browser
- [ ] Verify all pages load correctly

### 5. Configure Git
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## ✅ Day 2: Learn the Codebase (1 hour)

### 1. Read Documentation
- [ ] Read `README.md` completely
- [ ] Read `CONTRIBUTING.md`
- [ ] Bookmark this `ONBOARDING.md`

### 2. Explore Files
- [ ] Open and read `index.html` (landing page)
- [ ] Open and read `game.html` (game player)
- [ ] Open and read `admin.html` (AI game maker)
- [ ] Check out the `functions/` folder (API routes)

### 3. Understand the Stack
- [ ] Pure HTML/CSS/JS (no frameworks)
- [ ] Backend API: https://gametok-backend-production.up.railway.app
- [ ] Hosting: Cloudflare Pages
- [ ] Auto-deploys on push to `main`

### 4. Test the Workflow
```bash
# Create a test branch
git checkout -b test/my-first-branch

# Make a small change (add a comment in index.html)
# Save the file

# Commit
git add .
git commit -m "Test commit"

# Push
git push origin test/my-first-branch

# Go to GitHub and create a Pull Request
# Then delete the branch (practice cleanup)
```

---

## ✅ Day 3: First Contribution (2 hours)

### 1. Pick a Task
Choose one of these beginner tasks:

**Option A: Fix a Typo**
- Find a typo in any HTML file
- Fix it
- Commit and create PR

**Option B: Update a Color**
- Change a button color in `index.html`
- Test in browser
- Commit and create PR

**Option C: Add Your Name**
- Add yourself to a "Team" section (create if needed)
- Commit and create PR

### 2. Follow the Workflow
```bash
# Always start from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-task-name

# Make changes
# Test in browser

# Commit
git add .
git commit -m "Clear description of what you did"

# Push
git push origin feature/your-task-name

# Create Pull Request on GitHub
```

### 3. Get Your First PR Merged! 🎉
- [ ] Create the PR
- [ ] Wait for review
- [ ] Address any feedback
- [ ] Celebrate when merged!

---

## ✅ Week 1: Get Comfortable

### Daily Tasks
- [ ] Pull latest changes every morning: `git pull origin main`
- [ ] Check for new issues on GitHub
- [ ] Ask questions when stuck (no question is dumb!)
- [ ] Test your changes in multiple browsers

### Learn Git Basics
- [ ] `git status` - See what changed
- [ ] `git log` - See commit history
- [ ] `git branch` - See all branches
- [ ] `git checkout` - Switch branches
- [ ] `git pull` - Get latest changes
- [ ] `git push` - Send your changes

### Understand the Project
- [ ] What is GameTOK? (TikTok for games)
- [ ] Who are our users? (Mobile gamers)
- [ ] What makes us different? (AI game generation, swipe feed)
- [ ] What's the business model? (Ads, premium features)

---

## ✅ Week 2: Become Productive

### Take on Real Tasks
- [ ] Pick an issue from GitHub
- [ ] Estimate how long it will take
- [ ] Complete it
- [ ] Create PR
- [ ] Get it merged

### Learn the Backend API
- [ ] Read backend API docs (if available)
- [ ] Test API endpoints in browser/Postman
- [ ] Understand how frontend calls backend
- [ ] Make an API call from the frontend

### Improve Your Skills
- [ ] Learn HTML best practices
- [ ] Learn CSS flexbox and grid
- [ ] Learn JavaScript async/await
- [ ] Learn Git branching strategies

---

## 🎓 Resources for Learning

### Git & GitHub
- [Git Handbook](https://guides.github.com/introduction/git-handbook/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Visualizing Git](https://git-school.github.io/visualizing-git/)

### HTML/CSS
- [HTML Basics](https://developer.mozilla.org/en-US/docs/Learn/HTML)
- [CSS Basics](https://developer.mozilla.org/en-US/docs/Learn/CSS)
- [Flexbox Guide](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)

### JavaScript
- [JavaScript Basics](https://developer.mozilla.org/en-US/docs/Learn/JavaScript)
- [Modern JavaScript](https://javascript.info/)
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

---

## 🤝 Team Communication

### Daily Standup (if applicable)
- What did you do yesterday?
- What will you do today?
- Any blockers?

### Asking for Help
1. Try to solve it yourself (15 minutes)
2. Google the error message
3. Check documentation
4. Ask Kiro (if using AI assistant)
5. Ask the team (Slack/WhatsApp)

### Giving Updates
- Post in team chat when you start a task
- Post when you create a PR
- Post when you're blocked
- Post when you finish something!

---

## 🎯 Success Metrics

### Week 1
- [ ] 1 PR merged
- [ ] Understand the codebase
- [ ] Know the Git workflow

### Month 1
- [ ] 5+ PRs merged
- [ ] Can work independently on small tasks
- [ ] Comfortable with Git and GitHub

### Month 3
- [ ] 20+ PRs merged
- [ ] Can handle medium-sized features
- [ ] Helping onboard new team members

---

## 🚀 You're Ready!

Once you've completed this checklist, you're officially part of the team!

**Next steps:**
1. Pick issues labeled `good-first-issue`
2. Gradually take on bigger tasks
3. Ask questions and learn continuously
4. Help others when you can
5. Have fun building GameTOK! 🎮

---

## 📞 Who to Contact

- **Technical questions**: Ask in dev channel
- **Git/GitHub issues**: Ask senior developers
- **Design questions**: Ask design lead
- **General questions**: Ask project manager

---

**Welcome aboard! Let's build something amazing together! 🚀**
