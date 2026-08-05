// =============================================================================
// Vite build + dev-server configuration
// -----------------------------------------------------------------------------
// Plugins: @vitejs/plugin-react (Fast Refresh) + @tailwindcss/vite (Tailwind 4).
// Path alias `@/*` -> ./src/* matches tsconfig.paths.
// Dev proxy forwards /api/* to the Express backend (API_PROXY_TARGET, default
// http://localhost:5000) so the frontend never needs a CORS-exposed host.
// DISABLE_HMR (set by AI Studio) also disables file watching to cut CPU during
// automated edits — keep HMR toggles intact when deploying.
// =============================================================================
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var; file watching is
      // also turned off in that mode to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Forward /api requests to the reference backend in development.
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
