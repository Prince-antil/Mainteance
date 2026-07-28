import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No backend is bundled with this archive. Without this, Vite's SPA
// fallback answers every unmatched request (including /api/*) with
// index.html + HTTP 200, so the client's fetch().json() silently
// returns HTML/garbage and downstream code crashes (e.g. calling
// .slice on a non-array). This tiny middleware makes /api/* fail fast
// with a real error status + JSON body, which triggers the app's
// built-in "API unreachable" offline fallbacks instead.
function apiUnavailableStub() {
  return {
    name: 'api-unavailable-stub',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api')) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Backend API is not running in this environment.' }))
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiUnavailableStub()],
  build: {
    // Split heavy vendors into cacheable chunks for faster first paint
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
})
