# GameTOK Web Platform

**Live Site**: https://gametok.co  
**Repository**: https://github.com/FuckerXo2/gametok-landing

This is the **web platform** for GameTOK - it includes:
- 🎮 **Web game player** - TikTok-style feed to play games in browser (React app)
- 🤖 **AI game maker** - Generate games using AI (admin panel)
- 🌐 **Marketing pages** - Landing page in the "More" section
- 📱 **Deep linking** - Smart app redirects for mobile users

---

## 📁 Project Structure

```
gametok-landing/
├── src/                    # React source code (EDIT THESE!)
│   ├── components/         # Reusable React components
│   │   ├── Sidebar.tsx     # Left navigation sidebar
│   │   └── AstrocadeLogo.tsx
│   ├── pages/              # Page components (routes)
│   │   ├── Home.tsx        # Home feed
│   │   ├── Play.tsx        # Game player
│   │   ├── Create.tsx      # AI game maker
│   │   ├── Profile.tsx     # User profile
│   │   ├── More.tsx        # More/settings (includes landing page)
│   │   ├── Search.tsx      # Search games
│   │   ├── Messages.tsx    # Chat/messages
│   │   ├── SignIn.tsx      # Authentication
│   │   └── Multiplayer.tsx # PK mode
│   ├── services/           # API calls
│   │   └── api.ts          # Backend API integration
│   ├── App.tsx             # Main app component + routing
│   └── main.tsx            # React entry point
├── index.html              # Vite entry (compiled React app)
├── assets/                 # Compiled JS/CSS (auto-generated)
├── game.html               # Individual game player page
├── admin.html              # AI game maker admin panel
├── more/                   # Old marketing landing page (legacy)
├── functions/              # Cloudflare Pages Functions (API routes)
├── .well-known/            # Apple App Site Association (deep linking)
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
└── tsconfig.json           # TypeScript configuration
```

**Important**: 
- Edit files in `src/` directory
- Run `npm run build` to compile to root `index.html` + `assets/`
- Commit both source (`src/`) and built files (`index.html`, `assets/`)

---

## 🚀 Getting Started

### Prerequisites
- Git installed
- Node.js 18+ and npm installed
- GitHub account with collaborator access
- Text editor (VS Code recommended)
- Kiro AI assistant (optional but helpful!)

### Clone the Repository

```bash
git clone https://github.com/FuckerXo2/gametok-landing.git
cd gametok-landing
```

### Local Development

This is a **React + Vite app** that needs to be built:

```bash
# Install dependencies
npm install

# Start development server (hot reload enabled)
npm run dev
# Then visit: http://localhost:5173

# Build for production
npm run build
# Output goes to root directory (index.html + assets/)

# Preview production build
npm run preview
```

### Quick Start for Editing

1. **Install dependencies**: `npm install`
2. **Start dev server**: `npm run dev`
3. **Edit files in `src/`** - changes auto-reload
4. **Build when done**: `npm run build`
5. **Commit everything** including the built files

---

## 🔧 Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom CSS
- **Routing**: React Router v7
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Hosting**: Cloudflare Pages
- **Backend API**: https://gametok-backend-production.up.railway.app
- **Deep Linking**: Apple Universal Links, Android App Links

### Why React + Vite?

- ⚡ **Lightning fast** - Vite's instant HMR and optimized builds
- 🎯 **Component-based** - Reusable UI components
- 📦 **Type-safe** - TypeScript for better DX
- 🚀 **Modern** - Latest React 19 features

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

# Install dependencies if you haven't
npm install

# Create a new branch for your feature
git checkout -b feature/update-homepage
```

#### 2. Make Your Changes

Edit files in `src/`, start dev server to see changes:

```bash
# Start dev server (auto-reloads on changes)
npm run dev
# Visit http://localhost:5173
```

When satisfied with changes:

```bash
# Build for production
npm run build

# See what you changed
git status

# Stage your changes (source + built files)
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

### `src/pages/Home.tsx` - Home Feed
The main game feed page (TikTok-style).

**Common edits:**
- Feed layout and styling
- Game card components
- Infinite scroll logic

### `src/pages/Play.tsx` - Game Player
Where users play games in the web app.

**Common edits:**
- Game iframe integration
- Controls and UI
- Loading states

### `src/pages/Create.tsx` - AI Game Maker
AI-powered game generation interface.

**Common edits:**
- Form fields
- Game generation flow
- Preview functionality

### `src/pages/More.tsx` - More/Settings
Includes the marketing landing page content.

**Common edits:**
- Settings options
- About/help content
- Landing page sections

### `src/components/Sidebar.tsx` - Navigation
Left sidebar navigation.

**Common edits:**
- Navigation links
- Active states
- Icons and labels

### `admin.html` - Admin Panel (Legacy)
Standalone admin panel for AI game generation.

**Note**: This is a legacy file, consider migrating to React component.

### `game.html` - Standalone Game Player (Legacy)
Individual game player page for deep links.

**Note**: This is used for direct game links and app redirects.

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
3. Runs `npm run build` automatically
4. Deploys in ~30 seconds
5. Live at https://gametok.co

**Build Settings on Cloudflare:**
- Build command: `npm run build`
- Build output directory: `/` (root)
- Node version: 18+

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
- Verify `npm run build` ran successfully

### `npm install` fails

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Dev server won't start

```bash
# Check if port 5173 is in use
lsof -ti:5173 | xargs kill -9

# Restart dev server
npm run dev
```

### TypeScript errors

```bash
# Check for type errors
npm run lint

# If you need to ignore errors temporarily (not recommended)
# Add // @ts-ignore above the line
```

---

## 🤖 Working with Kiro

If you're using Kiro AI assistant, you can ask it to:

- **Read this README**: `#README.md` to understand the project
- **Edit React components**: "Update the hero section in src/pages/Home.tsx"
- **Create branches**: "Create a new branch for homepage updates"
- **Build the app**: "Run npm run build"
- **Commit changes**: "Commit these changes with a good message"
- **Review code**: "Check if this TypeScript code is correct"
- **Debug issues**: "Why is my component not rendering?"

Kiro can read this file and understand the entire project structure!

### Example Kiro Commands

```
"Read src/App.tsx and explain the routing"
"Update the sidebar navigation in src/components/Sidebar.tsx"
"Build the app and commit the changes"
"Create a new page component for settings"
"Fix TypeScript errors in src/pages/Play.tsx"
```

---

## 📚 Useful Commands

### Git Commands
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

### NPM Commands
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

---

## 🎯 Common Tasks

### Adding a New Page

1. Create `src/pages/NewPage.tsx`:
```tsx
export default function NewPage() {
  return (
    <div>
      <h1>New Page</h1>
    </div>
  );
}
```

2. Add route in `src/App.tsx`:
```tsx
import NewPage from './pages/NewPage';
// ...
<Route path="/new" element={<NewPage />} />
```

3. Add navigation link in `src/components/Sidebar.tsx`
4. Build and test: `npm run build && npm run preview`
5. Commit and push

### Adding a New Component

1. Create `src/components/MyComponent.tsx`:
```tsx
interface MyComponentProps {
  title: string;
}

export default function MyComponent({ title }: MyComponentProps) {
  return <div>{title}</div>;
}
```

2. Import and use in a page:
```tsx
import MyComponent from '../components/MyComponent';
// ...
<MyComponent title="Hello" />
```

### Updating Styles

Styles are in `.css` files next to components:
- `src/App.css` - Global app styles
- `src/pages/Home.css` - Home page styles
- `src/components/Sidebar.css` - Sidebar styles

Or use Tailwind classes directly in JSX:
```tsx
<div className="flex items-center justify-center bg-blue-500">
  Content
</div>
```

### Adding Images

1. Add image to `src/assets/` or `public/`
2. Import in component:
```tsx
import myImage from './assets/my-image.png';
// ...
<img src={myImage} alt="Description" />
```

Or reference from public:
```tsx
<img src="/my-image.png" alt="Description" />
```

### Making API Calls

Use the API service in `src/services/api.ts`:

```tsx
import { fetchGames } from '../services/api';

// In your component
const [games, setGames] = useState([]);

useEffect(() => {
  fetchGames().then(setGames);
}, []);
```

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
- [ ] Install Node.js 18+ if not installed
- [ ] Run `npm install` to install dependencies
- [ ] Run `npm run dev` to start dev server
- [ ] Open http://localhost:5173 in browser
- [ ] Make changes in `src/` directory
- [ ] See changes auto-reload in browser
- [ ] Run `npm run build` when done
- [ ] Create a feature branch
- [ ] Commit both source and built files
- [ ] Push branch to GitHub
- [ ] Create Pull Request
- [ ] Wait for review
- [ ] Celebrate when merged! 🎊

---

**Happy coding! 🚀**

If you're reading this in Kiro, you now understand the entire project structure and workflow. Feel free to ask me to help with any edits!
