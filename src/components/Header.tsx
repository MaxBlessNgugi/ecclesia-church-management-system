import React, { useState } from 'react';
import { NavigationTab } from '../types';

/**
 * Header component props interface.
 * Defines navigation callbacks, search toggle, and sidebar display state.
 */
interface HeaderProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
}

/**
 * Application Header component.
 * Renders the top app bar including navigation drawer toggle, brand logo,
 * global search bar trigger (Ctrl+K), and user account profile dropdown menu.
 */
export const Header: React.FC<HeaderProps> = ({
  onSelectTab,
  onToggleSidebar,
  onOpenSearch
}) => {
  // Controls visibility of the administrator profile dropdown menu
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-[#e1e3e3] px-4 flex items-center justify-between sticky top-0 z-30 shadow-xs select-none">
      {/* Sidebar navigation toggle and main application branding */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-[#1a1c1c] hover:bg-[#f4f3f3] rounded-md transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Toggle Navigation Menu"
          title="Toggle Navigation Menu"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        {/* Clicking branding logo resets view back to Main Dashboard */}
        <div
          onClick={() => onSelectTab('dashboard')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-lg tracking-wider group-hover:bg-[#333333] transition-colors">
            †
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#1a1c1c] tracking-tight leading-none font-serif">
              Ecclesia
            </h1>
            <p className="text-[10px] text-[#444748] tracking-widest uppercase mt-0.5">
              Church CMS
            </p>
          </div>
        </div>
      </div>

      {/* Central Global Search bar trigger for desktop viewports */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center gap-3 px-3 py-1.5 bg-[#f4f3f3] hover:bg-[#eeeeee] text-[#444748] rounded border border-[#e1e3e3] text-sm transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-base text-[#444748]">search</span>
          <span className="flex-1 text-left text-xs">Search members, records, forms...</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-white text-[#444748] border border-[#c4c7c7] rounded shadow-2xs font-mono">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right controls: Mobile search button & Administrator Account avatar */}
      <div className="flex items-center gap-2 relative">
        {/* Mobile search trigger button */}
        <button
          onClick={onOpenSearch}
          className="md:hidden p-2 text-[#1a1c1c] hover:bg-[#f4f3f3] rounded transition-colors cursor-pointer"
          title="Search"
          aria-label="Search"
        >
          <span className="material-symbols-outlined">search</span>
        </button>

        {/* User profile button & expandable dropdown menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1 rounded-full hover:bg-[#f4f3f3] border border-[#e1e3e3] transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center font-medium text-xs">
              FT
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-[#1a1c1c] leading-tight">
                Fr. Thomas
              </div>
              <div className="text-[10px] text-[#444748]">Administrator</div>
            </div>
            <span className="material-symbols-outlined text-sm text-[#444748]">
              expand_more
            </span>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#e1e3e3] rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-[#e1e3e3] bg-[#f4f3f3]">
                <p className="text-xs font-bold text-[#1a1c1c]">Fr. Thomas</p>
                <p className="text-[11px] text-[#444748]">fr.thomas@stmarysparish.org</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-[9px] bg-[#1e1e1e] text-white rounded font-medium">
                  St. Mary's Parish Admin
                </span>
              </div>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onSelectTab('dashboard');
                }}
                className="w-full text-left px-4 py-2 text-xs text-[#1a1c1c] hover:bg-[#f4f3f3] flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">dashboard</span>
                Parish Dashboard
              </button>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onSelectTab('administration');
                }}
                className="w-full text-left px-4 py-2 text-xs text-[#1a1c1c] hover:bg-[#f4f3f3] flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                Rights & Permissions
              </button>

              <div className="border-t border-[#e1e3e3] my-1" />

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onSelectTab('auth');
                }}
                className="w-full text-left px-4 py-2 text-xs text-[#ba1a1a] hover:bg-[#fce8e8] flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">logout</span>
                Sign Out / Switch User
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
