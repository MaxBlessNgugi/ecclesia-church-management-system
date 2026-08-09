// =============================================================================
// Vite build + dev-server configuration
// -----------------------------------------------------------------------------
// Plugins: @vitejs/plugin-react (Fast Refresh) + @tailwindcss/vite (Tailwind 4)
// + vite-plugin-pwa (Workbox-generated service worker, auto-update).
// Path alias `@/*` -> ./src/* matches tsconfig.paths.
// Dev proxy forwards /api/* to the Express backend (API_PROXY_TARGET, default
// http://localhost:5000) so the frontend never needs a CORS-exposed host.
// DISABLE_HMR (set by AI Studio) also disables file watching to cut CPU during
// automated edits — keep HMR toggles intact when deploying.
//
// PWA NOTES
//   - generateSW strategy; registerType 'autoUpdate' replaces the SW in the
//     background; injectRegister 'auto' (default) injects the registration
//     snippet into index.html, so src/main.tsx does NOT register /sw.js itself.
//   - Manifest is emitted as `manifest.json` (see `filename` below) to match
//     the existing <link rel="manifest"> in index.html.
//   - devOptions.enabled generates a dev SW that enables PWA testing in dev
//     without aggressive caching (HMR stays intact).
// =============================================================================
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Emit the manifest as manifest.json to match the <link> in index.html
        manifestFilename: 'manifest.json',
        includeAssets: ['fonts/**/*', 'icons/**/*'],
        manifest: {
          name: 'ECCLESIA ChMS',
          short_name: 'Ecclesia',
          description: 'Parish Church Management System — works offline',
          theme_color: '#1a1c1c',
          background_color: '#f9f9f9',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // public/fonts contains a 3.96 MB variable-font subset; raise the
          // default 2 MiB precache cap so fonts are guaranteed offline.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 8,
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
