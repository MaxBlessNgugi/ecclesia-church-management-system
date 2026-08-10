// =============================================================================
// TitleBar — slim OS-style title bar for the frameless Electron window
// -----------------------------------------------------------------------------
// Rendered at the very top of the root layout (App.tsx), above the Header nav
// bar. In the desktop app the window is frameless (frame: false in main.js),
// so this bar replaces the native OS title bar:
//
//   - Far left:  app icon + "Ecclesia ChMS" title + BETA badge (click → home)
//   - Center:    draggable drag region (.app-drag) for moving the window
//   - Far right: custom minimize / maximize-restore / close buttons, wired
//                through the preload bridge (window.electronAPI.windowControls)
//
// In a plain browser the window controls are hidden and the bar renders as a
// slim brand strip. Colors use the shell slate palette with dark:* variants,
// so the bar blends with the app theme instead of a native-looking strip.
// =============================================================================
import React, { useEffect, useState } from 'react';
/** React core library and useState/useEffect hooks for component state and effects */
import { NavigationTab } from '../types';
/** NavigationTab: union of all valid view keys (used for the brand home click) */

/**
 * TitleBar component props interface.
 * Only the brand navigation callback is needed; window state is self-contained.
 */
interface TitleBarProps {
  /** Callback that navigates to the specified top-level tab (brand click → Dashboard) */
  onSelectTab: (tab: NavigationTab) => void;
}

/**
 * Application TitleBar component.
 * Slim (~40px) bar acting as the custom title bar of the frameless window:
 * brand on the far left, a flexible drag region in the center, and the native
 * window controls (minimize / maximize-restore / close) on the far right.
 */
export const TitleBar: React.FC<TitleBarProps> = ({ onSelectTab }) => {
  // Whether the native window is maximized — swaps the maximize/restore icon
  const [isMaximized, setIsMaximized] = useState(false);

  // Preload bridge for the frameless window controls (undefined in a browser)
  const windowControls = (window as unknown as { electronAPI?: { windowControls?: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  } } }).electronAPI?.windowControls;

  /**
   * Keeps the maximize/restore icon in sync with the native window state
   * (subscribe to changes + initial query).
   */
  useEffect(() => {
    if (!windowControls) return;
    windowControls.isMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = windowControls.onMaximizeChange(setIsMaximized);
    return unsubscribe;
  }, []);

  return (
    /** Slim elevated bar: white/slate palette, drag region for the frameless window */
    <header className="app-drag h-10 shrink-0 flex items-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 select-none">
      {/* Far left: app icon + title + BETA badge — clicking returns to Dashboard */}
      <button
        onClick={() => onSelectTab('dashboard')}
        className="no-drag flex items-center gap-2 pl-3 pr-2 h-full cursor-pointer group"
        title="Ecclesia ChMS — Go to Dashboard"
        aria-label="Ecclesia ChMS — Go to Dashboard"
      >
        {/* Brand tile: dark rounded square with cross glyph */}
        <div className="w-5 h-5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-[11px] leading-none group-hover:bg-slate-700 dark:group-hover:bg-slate-300 transition-colors">
          †
        </div>
        {/* Clear, prominent app title */}
        <span className="text-sm font-semibold tracking-tight">Ecclesia ChMS</span>
        {/* Optional status tag */}
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-widest uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          Beta
        </span>
      </button>

      {/* Center: flexible drag region for moving the frameless window */}
      <div className="flex-1 h-full app-drag" />

      {/* Far right: custom window controls — only in the Electron desktop app */}
      {windowControls && (
        <div className="no-drag flex items-stretch h-full">
          {/* Minimize */}
          <button
            onClick={() => windowControls.minimize()}
            className="w-12 h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            aria-label="Minimize"
            title="Minimize"
          >
            <span className="material-symbols-outlined text-sm">minimize</span>
          </button>
          {/* Maximize / Restore (icon swaps with window state) */}
          <button
            onClick={() => windowControls.toggleMaximize()}
            className="w-12 h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <span className="material-symbols-outlined text-sm">
              {isMaximized ? 'crop' : 'crop_square'}
            </span>
          </button>
          {/* Close — hides to the system tray (close-to-tray behavior) */}
          <button
            onClick={() => windowControls.close()}
            className="w-12 h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
            title="Close (hides to tray)"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </header>
  );
};
