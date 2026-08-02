import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this repo from a subpath. Everything else — the manifest
// paths, the router basename, the service worker scope — is derived from this
// one value, so moving to a dedicated repo or a custom domain is a one-line
// change here.
const base = '/codex_experiments/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never swap the service worker out from under an in-progress capture.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'Idea Capture',
        short_name: 'Capture',
        id: base,
        start_url: `${base}?source=pwa`,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        description:
          'Capture raw ideas by voice or text and turn them into structured feature prompts.',
        categories: ['productivity', 'developer'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'New capture',
            url: `${base}?new=1`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
          { name: 'Projects', url: `${base}projects` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/functions\//],
        runtimeCaching: [
          {
            // Supabase REST reads — stale data beats a spinner. Writes are
            // never cached here; those go through the IndexedDB outbox.
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/github-proxy'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'github',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
