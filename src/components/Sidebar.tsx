// =============================================================================
// Sidebar — primary navigation drawer
// -----------------------------------------------------------------------------
// Renders the top-level panel list. Two visual modes:
//   expanded (w-60, labels) on desktop / open mobile drawer
//   icon-only (w-16) when isOpen is false
// Panel items are filtered by allowedPanels (the current user's permissions).
// Clicking an item navigates AND calls onCloseMobile — note this means any nav
// click collapses the drawer on mobile, and the icon-only title attribute is
// what deep-link/test scripts use to identify nav buttons.
// =============================================================================
import React from 'react';
/** React core library — used here only for JSX type-checking support */
import { NavigationTab, PanelKey } from '../types';
/** NavigationTab: union of all valid top-level view identifiers; PanelKey: subset used for permission gating */

/**
 * Interface properties for Sidebar navigation drawer component.
 */
interface SidebarProps {
  /** Currently active top-level view tab */
  currentTab: NavigationTab;
  /** Callback function to switch active navigation view tab */
  onSelectTab: (tab: NavigationTab) => void;
  /** Sidebar visibility expanded/collapsed state */
  isOpen: boolean;
  /** Callback to dismiss sidebar on mobile overlay click */
  onCloseMobile: () => void;
  /** Panels the signed-in user is permitted to access (empty = show all) */
  allowedPanels?: PanelKey[];
}

/**
 * Navigation item structural item interface.
 */
interface NavItem {
  /** Unique tab identifier corresponding to a NavigationTab value */
  id: NavigationTab;
  /** Human-readable label displayed alongside the icon when expanded */
  label: string;
  /** Material Symbols icon name rendered in the nav item */
  icon: string;
  /** Optional badge/pill text (e.g. count) displayed on the right side */
  badge?: string;
}

/**
 * Sidebar Navigation Drawer Component.
 * Supports expanded (full label) and collapsed (icon-only) view states with responsive mobile overlay.
 *
 * Behavior:
 * - On desktop: toggles between w-60 expanded and w-16 icon-only mode.
 * - On mobile: slides in from left over a semi-transparent backdrop when isOpen.
 * - Navigation items are permission-filtered via allowedPanels; 'dashboard' always appears.
 * - Each nav click also triggers onCloseMobile to auto-collapse the drawer on mobile.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onCloseMobile,
  allowedPanels
}) => {
  // Main management navigation menu items configuration
  const allNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'christian', label: 'Christian', icon: 'person_search' },
    { id: 'activities', label: 'Activities', icon: 'payments' },
    { id: 'sacraments', label: 'Sacraments', icon: 'church' },
    { id: 'finance', label: 'Finance', icon: 'account_balance' },
    { id: 'ledgers', label: 'Ledgers', icon: 'book_4' },
    { id: 'inventory', label: 'Inventory', icon: 'inventory_2' },
    { id: 'reports', label: 'Reports', icon: 'analytics' },
    { id: 'hr', label: 'HR', icon: 'groups' },
    { id: 'administration', label: 'Administration', icon: 'admin_panel_settings' }
  ];

  /**
   * Compute the visible navigation items based on user permissions.
   * If allowedPanels is provided and non-empty, only those panels (plus
   * 'dashboard' which is always shown) are included; otherwise all items are shown.
   */
  const navItems: NavItem[] =
    allowedPanels && allowedPanels.length > 0
      ? allNavItems.filter(
          (item) => item.id === 'dashboard' || (allowedPanels as string[]).includes(item.id)
        )
      : allNavItems;

  /**
   * Handles navigation item click and automatically collapses mobile overlay.
   * @param tab - The NavigationTab identifier to navigate to
   */
  const handleSelect = (tab: NavigationTab) => {
    /** Trigger the parent's tab selection callback */
    onSelectTab(tab);
    /** Close the mobile sidebar overlay after navigation */
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Screen Backdrop Overlay — semi-transparent black overlay that closes sidebar on click */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-[#000000]/40 z-40 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Drawer Container — fixed on mobile, static on desktop, transitions width and position */}
      <aside
        className={`fixed md:static top-16 bottom-0 left-0 z-40 bg-[#ffffff] border-r border-[#e1e3e3] flex flex-col justify-between transition-all duration-300 ease-in-out shrink-0 ${
          isOpen
            ? 'w-60 translate-x-0'
            : 'w-16 -translate-x-full md:translate-x-0'
        }`}
      >
        {/* Navigation Links List */}
        <div className="p-3 space-y-1 overflow-y-auto">
          {/* Section header — shown as text label when expanded, divider when collapsed */}
          {isOpen ? (
            <div className="px-3 py-2 text-[10px] font-bold text-[#444748] tracking-widest uppercase">
              Main Management
            </div>
          ) : (
            <div className="my-2 border-b border-[#e1e3e3]" />
          )}

          {/* Render each navigation tab link button */}
          {navItems.map((item) => {
            /** Determine if this nav item matches the currently active tab */
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                /** Show tooltip only when collapsed (icon-only) mode */
                title={!isOpen ? item.label : undefined}
                className={`w-full flex items-center rounded-md text-xs font-medium transition-all cursor-pointer ${
                  isOpen ? 'px-3 py-2.5 gap-3' : 'justify-center py-2.5 px-0'
                } ${
                  isActive
                    ? 'bg-[#1e1e1e] text-[#ffffff] shadow-2xs'
                    : 'text-[#1a1c1c] hover:bg-[#f4f3f3]'
                }`}
              >
                {/* Material Symbols icon — white when active, grey when inactive */}
                <span
                  className={`material-symbols-outlined text-xl ${
                    isActive ? 'text-[#ffffff]' : 'text-[#444748]'
                  }`}
                >
                  {item.icon}
                </span>

                {/* Label text and optional badge — only rendered in expanded mode */}
                {isOpen && (
                  <>
                    {/* Nav item label text — truncated if overflow */}
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {/* Optional badge pill — e.g. notification count */}
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-[#ba1a1a] text-white rounded-full font-bold shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Widget showing active parish connectivity status */}
        <div className="p-2 border-t border-[#e1e3e3] bg-[#f9f9f9]">
          {/* Expanded footer — full system status card with auth button */}
          {isOpen ? (
            <div className="p-3 rounded-lg bg-[#ffffff] border border-[#e1e3e3] text-center space-y-1">
              {/* Online status indicator with animated pulse dot */}
              <div className="text-xs font-semibold text-[#1a1c1c] flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                System Online
              </div>
              <p className="text-[10px] text-[#444748]">Ecclesia CMS</p>
              {/* System Auth button — navigates to the authentication/login view */}
              <button
                onClick={() => handleSelect('auth')}
                className="mt-2 w-full py-1 text-[11px] text-[#1e1e1e] bg-[#f4f3f3] hover:bg-[#eeeeee] border border-[#c4c7c7] rounded transition-colors font-medium cursor-pointer"
              >
                System Auth
              </button>
            </div>
          ) : (
            /* Collapsed footer — icon-only shield button for system auth */
            <button
              onClick={() => handleSelect('auth')}
              title="System Auth"
              className="w-full py-2 flex justify-center text-[#1e1e1e] hover:bg-[#e1e3e3] rounded transition-colors"
            >
              <span className="material-symbols-outlined text-lg">shield</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
