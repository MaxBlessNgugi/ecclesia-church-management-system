// =============================================================================
// Frontend entrypoint
// -----------------------------------------------------------------------------
// Mounts the <App/> shell into #root under React.StrictMode (double-invokes
// effects in dev to surface stale-closure / impurity bugs), loads the app fonts
// first, then the Tailwind + custom base styles in index.css.
// =============================================================================
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './assets/fonts.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
