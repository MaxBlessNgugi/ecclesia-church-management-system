// Barrel export for shared layout components — keeps import paths tidy
// (e.g. `import { Header, Sidebar } from './components'`).

/**
 * Re-exports the TitleBar component — the slim brand strip at the top of the
 * application (parish identity + ECCLESIA brand).
 * @see TitleBar.tsx
 */
export { TitleBar } from './TitleBar'; // Named re-export from TitleBar module

/**
 * Re-exports the Header component — the sticky top nav bar containing
 * sidebar toggle, search trigger, and user profile dropdown.
 * @see Header.tsx
 */
export { Header } from './Header'; // Named re-export from Header module

/**
 * Re-exports the Sidebar component — the primary navigation drawer
 * supporting expanded and icon-only modes with mobile overlay.
 * @see Sidebar.tsx
 */
export { Sidebar } from './Sidebar'; // Named re-export from Sidebar module

/**
 * Re-exports the Footer component — the static presentational bottom bar
 * displaying branding, inspirational quote, and auxiliary links.
 * @see Footer.tsx
 */
export { Footer } from './Footer'; // Named re-export from Footer module

/**
 * Re-exports the GlobalSearchModal component — the Ctrl+K search overlay
 * for instant parishioner lookup and quick-action navigation shortcuts.
 * @see GlobalSearchModal.tsx
 */
export { GlobalSearchModal } from './GlobalSearchModal'; // Named re-export from GlobalSearchModal module
