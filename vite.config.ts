import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// 2D stack: PixiJS (render/canvas) + React/Tailwind (DOM UI overlay).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Manual registration (src/lib/pwaRegister.ts) instead of the auto-injected script: we need
      // fine-grained control to (a) check for updates immediately on every load — F5 or reopening
      // the app — instead of waiting for the browser's default cycle (which can take up to 24h),
      // and (b) provide a way to DISABLE the whole service worker (with cache cleanup) during
      // QA/dev, otherwise the cache gets in the way of seeing the newest build.
      injectRegister: false,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/',
        lang: 'pt-BR',
        // ':' instead of an em dash — a common game-naming pattern in app stores
        // (Play Store etc.): "Game Name: Subtitle".
        name: 'Decanta: Water Sort',
        short_name: 'Decanta',
        description: 'Decante os líquidos até cada tubo ter uma só cor.',
        theme_color: '#0b1322',
        background_color: '#0b1322',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML/icons) — precache, available offline from the first visit.
        // Does NOT include /audio/**: it's ~186MB (46 files); precaching all of it would make
        // the app "install" huge and slow. Audio is cached on demand (see runtimeCaching).
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        globIgnores: ['audio/**'],
        navigateFallback: '/index.html',
        // Reinforcement for the installed PWA: without this, a newly ACTIVATED worker only takes
        // control of clients that didn't yet have a controller — a 2nd window/tab of the same PWA
        // that was already open would stay under the old worker until its OWN reload. The main
        // auto-update flow (pwaRegister.ts) already forces an explicit reload and so didn't depend
        // on this, but clientsClaim closes the gap for any client that escapes that flow.
        clientsClaim: true,
        runtimeCaching: [
          {
            // SFX only (sfx_*): StaleWhileRevalidate — cached on the fetch that decodes them, so
            // they work offline after being loaded once. Music (bgm_*) is intentionally NOT handled
            // here: it's managed by an app-level cache in the audio engine (see MUSIC_CACHE) that
            // caches a track only once it has practically played through, and plays it back from a
            // blob — this avoids the unreliable range-request handling of media elements in the SW
            // and keeps a track that was never played from ever being downloaded.
            urlPattern: ({ url }) => /\/audio\/sfx_.*\.(mp3|ogg)$/i.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'decanta-audio',
              cacheableResponse: { statuses: [0, 200, 206] },
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5176, host: true },
  preview: { port: 4176, host: true },
});
