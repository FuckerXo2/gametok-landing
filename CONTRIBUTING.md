# Contributing to GameTOK Landing

Welcome! This guide will help you start contributing to the GameTOK web platform.

## 🚀 Quick Start (5 minutes)

### 1. Get Access
Ask the repo owner to add you as a collaborator on GitHub.

### 2. Clone the Repo
```bash
git clone https://github.com/FuckerXo2/gametok-landing.git
cd gametok-landing
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Start Dev Server
```bash
npm run dev
# Visit http://localhost:5173
```

### 5. Make Changes
```bash
# Create a branch
git checkout -b feature/my-changes

# Edit files in src/ directory
# Changes auto-reload in browser

# Build for production
npm run build

# Commit (both source and built files)
git add .
git commit -m "Describe what you changed"

# Push
git push origin feature/my-changes
```

### 5. Create Pull Request
Go to GitHub and click "Create Pull Request"

---

## 📋 Branch Naming Convention

Use these prefixes:

- `feature/` - New features (e.g., `feature/add-game-filters`)
- `fix/` - Bug fixes (e.g., `fix/broken-link`)
- `design/` - UI/UX changes (e.g., `design/update-colors`)
- `content/` - Copy/text changes (e.g., `content/update-homepage`)
- `docs/` - Documentation (e.g., `docs/add-api-guide`)

---

## ✅ Before You Push

- [ ] Test in dev server (`npm run dev`)
- [ ] Build successfully (`npm run build`)
- [ ] Test in browser (Chrome, Safari, Firefox)
- [ ] Test on mobile (responsive design)
- [ ] Check for console errors (F12 → Console)
- [ ] Check for TypeScript errors (`npm run lint`)
- [ ] Spell check your copy
- [ ] Commit message is clear
- [ ] Committed both source (`src/`) and built files

---

## 🎨 Code Style

### React/TypeScript
- Use functional components with hooks
- Use TypeScript interfaces for props
- Use PascalCase for component names (e.g., `GameCard`)
- Use camelCase for variables (e.g., `gameList`)
- Add type annotations for function parameters
- Keep components small and focused
- Extract reusable logic into custom hooks

### HTML/JSX
- Use 2 spaces for indentation
- Keep lines under 120 characters
- Use semantic HTML tags
- Add comments for complex sections
- Use self-closing tags for components without children

### CSS
- Use kebab-case for class names (e.g., `.hero-section`)
- Group related styles together
- Add comments for color variables
- Mobile-first responsive design
- Prefer Tailwind utility classes when possible

### JavaScript/TypeScript
- Use `const` and `let`, not `var`
- Use arrow functions for callbacks
- Add comments for complex logic
- Handle errors gracefully
- Use async/await instead of promises chains

---

## 🐛 Reporting Bugs

Found a bug? Create an issue on GitHub with:

1. **Title**: Short description
2. **Description**: What happened vs what should happen
3. **Steps to reproduce**: How to trigger the bug
4. **Screenshots**: If visual bug
5. **Browser**: Chrome 120, Safari 17, etc.

---

## 💡 Suggesting Features

Have an idea? Create an issue with:

1. **Title**: Feature name
2. **Problem**: What problem does it solve?
3. **Solution**: How should it work?
4. **Mockups**: Sketches or designs (optional)

---

## 🤝 Pull Request Process

1. **Create branch** from `main`
2. **Make changes** and test thoroughly
3. **Push branch** to GitHub
4. **Create PR** with clear description
5. **Wait for review** (usually 1-2 days)
6. **Address feedback** if requested
7. **Merge** when approved

### Good PR Description Template

```markdown
## What Changed
Brief description of what you changed

## Why
Why was this change needed?

## Testing
- [ ] Tested in Chrome
- [ ] Tested in Safari
- [ ] Tested on mobile
- [ ] No console errors

## Screenshots
(Add before/after screenshots if visual change)
```

---

## 🚫 What NOT to Do

- ❌ Don't push directly to `main`
- ❌ Don't commit sensitive data (passwords, API keys)
- ❌ Don't commit large files (>1MB images)
- ❌ Don't break existing functionality
- ❌ Don't commit commented-out code
- ❌ Don't use `git push --force` on shared branches

---

## 🆘 Getting Help

1. **Read the README** - Most answers are there
2. **Ask Kiro** - If you're using the AI assistant
3. **Create an issue** - For bugs or questions
4. **Ask the team** - On Slack/WhatsApp

---

## 🎓 Learning Resources

### Git & GitHub
- [GitHub Git Cheat Sheet](https://education.github.com/git-cheat-sheet-education.pdf)
- [Learn Git Branching](https://learngitbranching.js.org/)

### React & TypeScript
- [React Docs](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

### Vite
- [Vite Guide](https://vite.dev/guide/)

### Tailwind CSS
- [Tailwind Docs](https://tailwindcss.com/docs)

### HTML/CSS/JS
- [MDN Web Docs](https://developer.mozilla.org/)
- [CSS Tricks](https://css-tricks.com/)
- [JavaScript.info](https://javascript.info/)

---

## 🎉 Your First Contribution

Not sure where to start? Try these beginner-friendly tasks:

1. Fix a typo in a React component
2. Update a color in the CSS
3. Add a new icon to the sidebar
4. Improve button hover effects
5. Update the footer in More page
6. Add a new game category option
7. Improve TypeScript types

Look for issues labeled `good-first-issue` on GitHub!

---

**Thank you for contributing to GameTOK! 🚀**
