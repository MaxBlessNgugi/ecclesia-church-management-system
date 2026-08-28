// =============================================================================
// TitleBar — slim brand strip at the top of the application
// ---------------------------------------------------------------------------
// Rendered at the very top of the root layout (App.tsx), above the Header nav
// bar. Displays the dual brand lockup: parish logo/name + ECCLESIA cross icon.
// Uses live parish data from useParishInfo so changes made by an admin update
// the title bar in real time.
// =============================================================================
import React from 'react';
import { NavigationTab } from '../types';
import { useParishInfo } from '../hooks/useParishInfo';
import { EcclesiaIcon } from './EcclesiaIcon';

interface TitleBarProps {
  onSelectTab: (tab: NavigationTab) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSelectTab }) => {
  const parish = useParishInfo();

  return (
    <header className="h-10 shrink-0 flex items-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 select-none">
      {/* Far left: dual brand lockup — parish identity + ECCLESIA */}
      <button
        onClick={() => onSelectTab('dashboard')}
        className="flex items-center gap-2 pl-3 pr-2 h-full cursor-pointer group"
        title="Ecclesia ChMS — Go to Dashboard"
        aria-label="Ecclesia ChMS — Go to Dashboard"
      >
        {/* Parish logo or placeholder */}
        {parish.logoData ? (
          <img
            src={parish.logoData}
            alt="Parish logo"
            className="w-6 h-6 rounded object-contain"
          />
        ) : (
          <div className="w-6 h-6 rounded border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-[7px] font-bold text-slate-400 dark:text-slate-500 leading-none">
            Logo
          </div>
        )}

        {/* Parish name + local church (secondary line) */}
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200 max-w-[120px] sm:max-w-[160px] truncate leading-tight">
            {parish.name || 'Ecclesia'}
          </span>
          {parish.localChurch && (
            <span className="text-[9px] text-slate-500 dark:text-slate-400 max-w-[120px] sm:max-w-[160px] truncate leading-tight hidden sm:block">
              {parish.localChurch}
            </span>
          )}
        </div>

        {/* Vertical divider between parish and ECCLESIA brand */}
        <span className="text-slate-300 dark:text-slate-600 text-xs">|</span>

        {/* ECCLESIA brand tile: dark rounded square with canonical arch+E glyph */}
        <div className="w-6 h-6 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center group-hover:bg-slate-700 dark:group-hover:bg-slate-300 transition-colors">
          <EcclesiaIcon size={18} className="w-[18px] h-[18px]" />
        </div>

        {/* ECCLESIA app title + subtitle */}
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-50 leading-tight">ECCLESIA</span>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight hidden sm:block">Parish ERP</span>
        </div>
      </button>

      {/* Center: flexible spacer */}
      <div className="flex-1 h-full" />
    </header>
  );
};
