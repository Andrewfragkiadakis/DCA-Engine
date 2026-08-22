import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // hand-written /public/site.webmanifest is already linked in index.html
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // pdf.js is lazy-loaded only when importing a PDF statement — don't bloat the
        // initial install with it, cache it on first actual use instead.
        globIgnores: ['**/pdf*.js', '**/pdf.worker*'],
        runtimeCaching: [{
          urlPattern: ({ url }) => /\/assets\/pdf/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'pdfjs-lazy-cache' },
        }],
        // Never let the SPA fallback intercept /api/* navigations (e.g. the sign-out link) —
        // those must always hit the network, not a cached index.html.
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})
