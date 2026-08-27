// =============================================================================
// Footer — presentational bottom bar rendered inside <main> on every panel
// ---------------------------------------------------------------------------
// Shows the dual brand lockup: parish logo/name + ECCLESIA cross, centred.
// Displays the parish motto when configured. Uses live data from useParishInfo.
// =============================================================================
import React from 'react';
import { useParishInfo } from '../hooks/useParishInfo';
import { EcclesiaIcon } from './EcclesiaIcon';

export const Footer: React.FC = () => {
  const parish = useParishInfo();

  return (
    <footer className="mt-12 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-6 px-6 text-center text-xs text-slate-600 dark:text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-3">
        {/* Dual brand lockup — centred */}
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          {/* Parish logo (or placeholder) */}
          {parish.logoData ? (
            <img src={parish.logoData} alt="Parish logo" className="w-6 h-6 rounded object-contain" />
          ) : (
            <div className="w-6 h-6 rounded border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-[7px] font-bold text-slate-400 dark:text-slate-500 leading-none">
              Logo
            </div>
          )}

          {/* Parish name + local church */}
          <div className="flex flex-col">
            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs leading-tight">
              {parish.name || 'Ecclesia'}
            </span>
            {parish.localChurch && (
              <span className="text-slate-500 dark:text-slate-400 text-[10px] leading-tight">
                {parish.localChurch}
              </span>
            )}
          </div>

          {/* Vertical divider */}
          <span className="text-slate-300 dark:text-slate-600">|</span>

          {/* ECCLESIA arch+E icon + app name + subtitle */}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center">
              <EcclesiaIcon size={14} className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs leading-tight">ECCLESIA</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Parish ERP</span>
            </div>
          </div>
        </div>

        {/* Parish motto (when configured) */}
        {parish.motto && (
          <p className="italic text-slate-500 dark:text-slate-400 text-[11px]">
            &ldquo;{parish.motto}&rdquo;
          </p>
        )}

        {/* Quick links */}
        <div className="flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="hover:underline cursor-pointer">Privacy Policy</span>
          <span>•</span>
          <span className="hover:underline cursor-pointer">Terms of Service</span>
          <span>•</span>
          <span className="hover:underline cursor-pointer">System Support</span>
        </div>
      </div>
    </footer>
  );
};
