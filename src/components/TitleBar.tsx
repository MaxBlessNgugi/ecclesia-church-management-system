// =============================================================================
// TitleBar — slim OS-style title bar for the frameless Electron window
// ---------------------------------------------------------------------------
// Rendered at the very top of the root layout (App.tsx), above the Header nav
// bar. In the desktop app the window is frameless (frame: false in main.js),
// so this bar replaces the native OS title bar:
//
//   - Far left:  parish logo/name (or placeholder) + vertical divider +
//                ECCLESIA cross icon + app title + BETA badge
//   - Center:    draggable drag region (.app-drag) for moving the window
//   - Far right: custom minimize / maximize-restore / close buttons, wired
//                through the preload bridge (window.electronAPI.windowControls)
//
// In a plain browser the window controls are hidden and the bar renders as a
// slim brand strip. Uses live parish data from useParishInfo so changes made
// by an admin update the title bar in real time.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { NavigationTab } from '../types';
import { useParishInfo } from '../hooks/useParishInfo';

interface TitleBarProps {
  onSelectTab: (tab: NavigationTab) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSelectTab }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const parish = useParishInfo();

  const windowControls = (window as unknown as { electronAPI?: { windowControls?: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  } } }).electronAPI?.windowControls;

  useEffect(() => {
    if (!windowControls) return;
    windowControls.isMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = windowControls.onMaximizeChange(setIsMaximized);
    return unsubscribe;
  }, []);

  return (
    <header className="app-drag h-10 shrink-0 flex items-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 select-none">
      {/* Far left: dual brand lockup — parish identity + ECCLESIA */}
      <button
        onClick={() => onSelectTab('dashboard')}
        className="no-drag flex items-center gap-2 pl-3 pr-2 h-full cursor-pointer group"
        title="Ecclesia ChMS — Go to Dashboard"
        aria-label="Ecclesia ChMS — Go to Dashboard"
      >
        {/* Parish logo or placeholder */}
        {parish.logoData ? (
          <img
            src={parish.logoData}
            alt="Parish logo"
            className="w-5 h-5 rounded object-contain"
          />
        ) : (
          <div className="w-5 h-5 rounded border border-dashed border-slate-400 dark:border-slate-600 flex items-center justify-center text-[8px] text-slate-400 dark:text-slate-500 leading-none">
            Logo
          </div>
        )}

        {/* Parish name (or fallback) */}
        {parish.name && (
          <span className="text-[11px] font-semibold tracking-tight text-slate-700 dark:text-slate-300 max-w-[140px] truncate hidden sm:inline">
            {parish.name}
          </span>
        )}

        {/* Vertical divider between parish and ECCLESIA brand */}
        {parish.name && (
          <span className="text-slate-300 dark:text-slate-600 text-xs hidden sm:inline">|</span>
        )}

        {/* ECCLESIA brand tile: dark rounded square with cross glyph */}
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
          <button
            onClick={() => windowControls.minimize()}
            className="w-12 h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            aria-label="Minimize"
            title="Minimize"
          >
            <span className="material-symbols-outlined text-sm">minimize</span>
          </button>
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
