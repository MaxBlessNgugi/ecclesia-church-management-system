// =============================================================================
// Ecclesia CMS — Frontend Entry Point
// =============================================================================
//
// PURPOSE
//   Bootstraps the React 19 application into the DOM. This is the single
//   mounting point for the entire SPA. It configures React.StrictMode for
//   development-time safety checks and loads global stylesheets in the correct
//   order: fonts → Tailwind base → custom utilities.
//
// ARCHITECTURE NOTES
//   - React 19's createRoot() enables concurrent features (transitions, useDeferredValue)
//   - StrictMode double-invokes effects in development ONLY to detect side-effect
//     cleanup bugs (stale closures, missing dependencies, subscription leaks)
//   - Font loading (assets/fonts.css) MUST precede Tailwind (index.css) so that
//     font-family utilities resolve correctly during the first paint
//   - OfflineProvider wraps the app to provide online/offline/syncing state
//   - Service worker is registered via vite-plugin-pwa (autoUpdate)
//
// LOAD ORDER
//   1. fonts.css       → @font-face declarations for Inter, serif fallbacks
//   2. index.css       → @tailwind base; @tailwind components; @tailwind utilities;
//                        CSS custom properties (--color-*, --spacing-*)
//   3. App.tsx         → Providers (PermissionsProvider, OfflineProvider) + shell + views
//
// DEVELOPMENT VS PRODUCTION
//   - Dev (vite):        main.tsx → HMR → App.tsx (StrictMode ON)
//   - Build (vite build): main.tsx → dist/assets/*.js → index.html (StrictMode OFF)
//
// RELATED FILES
//   - src/App.tsx              → Root component, auth gate, navigation state
//   - src/index.css            → Tailwind v4 + design tokens
//   - src/assets/fonts.css     → Self-hosted Inter variable font
//   - src/context/OfflineContext.tsx → OfflineProvider for connectivity state
//   - src/services/sync.ts     → Background sync for offline queue
//   - vite.config.ts           → Build config, PWA plugin, path aliases
// =============================================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { OfflineProvider } from './context/OfflineContext';
import './assets/fonts.css';
import './index.css';

// Retrieve the root DOM element where React will mount the application.
const rootElement = document.getElementById('root')!;

// Create a React 19 root using createRoot for concurrent rendering features.
// StrictMode wraps the app to enable development-only warnings.
createRoot(rootElement).render(
  <StrictMode>
    <OfflineProvider>
      <App />
    </OfflineProvider>
  </StrictMode>,
);

// Register service worker for offline caching (manual registration)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}
