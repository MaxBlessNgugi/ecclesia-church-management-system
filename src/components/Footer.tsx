// =============================================================================
// Footer — presentational bottom bar rendered inside <main> on every panel
// ---------------------------------------------------------------------------
// Shows the dual brand lockup: parish logo/name + ECCLESIA cross, centred.
// Displays the parish motto when configured. Uses live data from useParishInfo.
// =============================================================================
import React from 'react';
import { useParishInfo } from '../hooks/useParishInfo';

export const Footer: React.FC = () => {
  const parish = useParishInfo();

  return (
    <footer className="mt-12 border-t border-[#e1e3e3] bg-[#ffffff] py-6 px-6 text-center text-xs text-[#444748]">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-3">
        {/* Dual brand lockup — centred */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {/* Parish logo (or placeholder) */}
          {parish.logoData ? (
            <img src={parish.logoData} alt="Parish logo" className="w-5 h-5 rounded object-contain" />
          ) : (
            <div className="w-5 h-5 rounded border border-dashed border-[#c4c7c7] flex items-center justify-center text-[8px] text-[#c4c7c7] leading-none">
              Logo
            </div>
          )}

          {/* Parish name + local church */}
          {parish.name ? (
            <span className="font-bold text-[#1a1c1c]">
              {parish.name}
              {parish.localChurch && (
                <span className="font-normal text-[#444748] ml-1 text-[11px]">
                  — {parish.localChurch}
                </span>
              )}
            </span>
          ) : (
            <span className="font-bold text-[#1a1c1c]">ECCLESIA</span>
          )}

          {/* Vertical divider */}
          <span className="text-[#c4c7c7]">|</span>

          {/* ECCLESIA cross icon + app name */}
          <span className="font-bold text-[#1a1c1c]">† Ecclesia CMS</span>
        </div>

        {/* Parish motto (when configured) */}
        {parish.motto && (
          <p className="italic text-[#444748] text-[11px]">
            &ldquo;{parish.motto}&rdquo;
          </p>
        )}

        {/* Quick links */}
        <div className="flex items-center gap-4 text-[11px]">
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
