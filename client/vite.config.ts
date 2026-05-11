import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'AHV Arbeitszettel',
        short_name: 'AHV',
        description: 'Arbeitszettel, Angebote, Lieferscheine und Wartung für SHK-Betrieb',
        lang: 'de',
        theme_color: '#2563eb',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Auth-relevante Endpoints nicht cachen — sonst sieht man veraltete
        // Status-Daten nach Login/Logout.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // GET-API: NetworkFirst — bei Offline aus dem Cache, sonst aktuell
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') &&
              request.method === 'GET' &&
              !url.pathname.startsWith('/api/auth/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ahv-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Foto-Endpoints werden durch Annotation überschrieben — also
            // StaleWhileRevalidate, damit andere Geräte nicht 7 Tage lang
            // veraltete Bilder sehen.
            urlPattern: ({ url }) =>
              /^\/api\/auftraege\/[^/]+\/fotos\//.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ahv-fotos-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Logo aus dem Backend (kommt häufig vor)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/logo'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ahv-logo-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Fonts und sonstige Assets
            urlPattern: ({ request }) =>
              request.destination === 'style' ||
              request.destination === 'script' ||
              request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'ahv-assets-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Sonstige Bilder (Icons etc.) — keine API-Bilder mehr, weil die
            // Foto-Regel oben greift; kein Risiko von veralteten Annotationen.
            urlPattern: ({ request, url }) =>
              request.destination === 'image' && !url.pathname.startsWith('/api/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ahv-images-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // SW nur in Production aktivieren
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
