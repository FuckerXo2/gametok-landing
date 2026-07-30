import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep every consumer of React on one module instance. Without this, Vite can
  // discover a React-dependent package mid-session, re-run the dep optimizer and
  // leave the page holding two copies of React — which surfaces as
  // "Invalid hook call" even though node_modules only has one react installed.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // Every React-consuming dependency belongs here, so they are all pre-bundled
  // in one optimizer pass on startup rather than discovered mid-session. Add to
  // this list when you introduce another package that imports React.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'lucide-react',
    ],
  },
  server: {
    port: 5176,
    strictPort: true
  }
})
