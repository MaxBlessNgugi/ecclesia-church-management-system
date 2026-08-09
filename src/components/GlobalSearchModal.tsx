// =============================================================================
// GlobalSearchModal — Ctrl+K member search overlay
// -----------------------------------------------------------------------------
// Client-side instant search over the lifted `christians` array (no API call):
// matches name parts, regNo, phone and SCC. When the input is empty it shows
// static quick-action shortcuts instead. A window keydown listener toggles the
// modal via Ctrl/Cmd+K and closes it with Escape; the component renders nothing
// (null) when closed to avoid paying DOM cost.
// =============================================================================
import React, { useState, useEffect } from 'react';
/** React core library and hooks for local state and lifecycle side effects */
import { ChristianRecord, NavigationTab } from '../types';
/** ChristianRecord: typed shape for parishioner data; NavigationTab: valid tab identifiers for quick-link navigation */

/**
 * Interface properties for the Global Search Modal.
 */
interface GlobalSearchModalProps {
  /** Flag determining modal open/close status */
  isOpen: boolean;
  /** Callback triggered when user dismisses the modal */
  onClose: () => void;
  /** Full list of parishioner records for client-side search indexing */
  christians: ChristianRecord[];
  /** Callback when user clicks a specific member search result */
  onSelectMember: (member: ChristianRecord) => void;
  /** Callback to navigate to key view modules via shortcut links */
  onNavigate: (tab: NavigationTab) => void;
}

/**
 * Global Search Modal Component.
 * Implements instant search filtering across parishioner names, registration numbers,
 * telephone numbers, and SCC communities. Features Ctrl+K / Cmd+K keyboard shortcut listener.
 *
 * Rendering strategy:
 * - Returns null when closed (no DOM cost).
 * - When open, renders a full-screen overlay with a centered search card.
 * - Empty search term shows quick-action shortcut links; populated search
 *   filters christians client-side by name, regNo, phone, and scc fields.
 */
export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  christians,
  onSelectMember,
  onNavigate
}) => {
  // Search query text input state
  const [searchTerm, setSearchTerm] = useState('');
  /** The current text value of the search input field */

  /**
   * Global keydown event handler for Ctrl+K shortcut toggle and ESC key close.
   * Listens on the window object so the shortcut works from anywhere in the app.
   * Cleans up the listener on component unmount to prevent memory leaks.
   */
  useEffect(() => {
    /**
     * Handles keyboard events globally.
     * @param e - The native KeyboardEvent dispatched on the window
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle search modal when pressing Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        /** Prevent the browser's native Ctrl+K behavior (e.g. quick search bar) */
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        // Dismiss modal when pressing Escape key
        onClose();
      }
    };

    // Attach listener to window
    window.addEventListener('keydown', handleKeyDown);
    // Cleanup event listener on component unmount
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Return null if modal is not active to avoid DOM rendering overhead
  if (!isOpen) return null;

  // Filter Christian records based on user search term query match
  const filteredMembers = christians.filter((c) => {
    /** Lowercased search term for case-insensitive matching */
    const term = searchTerm.toLowerCase();
    return (
      /** Match against baptismal name (first name) */
      c.baptismalName.toLowerCase().includes(term) ||
      /** Match against sir name (surname/last name) */
      c.sirName.toLowerCase().includes(term) ||
      /** Match against registration number */
      c.regNo.toLowerCase().includes(term) ||
      /** Match against phone number */
      c.phone.includes(term) ||
      /** Match against SCC (Small Christian Community) name */
      c.scc.toLowerCase().includes(term)
    );
  });

  // Pre-configured quick action navigation shortcuts displayed when search input is empty
  const quickLinks: { title: string; tab: NavigationTab; icon: string }[] = [
    { title: 'Add New Christian Record', tab: 'christian', icon: 'person_add' },
    { title: 'Receive Tithes & Contributions', tab: 'activities', icon: 'payments' },
    { title: 'Update Sacrament Cards', tab: 'sacraments', icon: 'church' },
    { title: 'Log Deposit / Bank Transfer', tab: 'finance', icon: 'account_balance' },
    { title: 'View General Ledgers', tab: 'ledgers', icon: 'book_4' }
  ];

  return (
    // Modal Overlay Backdrop with subtle blur effect
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-[#000000]/50 backdrop-blur-xs">
      {/* Modal Card Dialog Container */}
      <div className="w-full max-w-xl bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar Header */}
        <div className="p-3 border-b border-[#e1e3e3] flex items-center gap-2 bg-[#ffffff]">
          {/* Search icon */}
          <span className="material-symbols-outlined text-[#444748]">search</span>
          {/* Search text input — auto-focused on open for immediate typing */}
          <input
            type="text"
            autoFocus
             placeholder="Search parishioners by name, reg no, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 text-sm text-[#1a1c1c] outline-none placeholder-[#444748] bg-transparent"
          />
          {/* Close button — dismisses the modal */}
          <button
            onClick={onClose}
            className="p-1 text-[#444748] hover:bg-[#f4f3f3] rounded cursor-pointer"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        {/* Dynamic Search Results & Quick Action Links Body */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {/* Conditional render: search results when typing, shortcuts when empty */}
          {searchTerm.trim() ? (
            // Rendered Search Results List
            <div>
              {/* Section header with result count */}
              <div className="text-[10px] font-bold uppercase text-[#444748] tracking-wider mb-2 px-1">
                Matching Parishioners ({filteredMembers.length})
              </div>
              {/* Empty state when no members match the search */}
              {filteredMembers.length === 0 ? (
                // Zero results empty state callout
                <div className="p-6 text-center text-xs text-[#444748]">
                  No Christian records found for "{searchTerm}".
                </div>
              ) : (
                // Filtered Member Cards
                <div className="space-y-1">
                  {/* Render each matching parishioner as a clickable card */}
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => {
                        /** Pass the selected member back to the parent and close the modal */
                        onSelectMember(member);
                        onClose();
                      }}
                      className="w-full p-2.5 rounded-lg border border-transparent hover:border-[#e1e3e3] hover:bg-[#f4f3f3] text-left flex items-center justify-between transition-colors cursor-pointer group"
                    >
                      {/* Member information container */}
                      <div>
                        {/* Full name display — baptismal + second + sir name */}
                        <div className="text-xs font-bold text-[#1a1c1c] group-hover:text-[#1e1e1e]">
                          {member.baptismalName} {member.secondName} {member.sirName}
                        </div>
                        {/* Secondary info row — reg number, SCC, and phone */}
                        <div className="text-[11px] text-[#444748] flex items-center gap-2 mt-0.5">
                          {/* Registration number with mono font badge */}
                          <span className="font-mono bg-[#eeeeee] px-1 rounded text-[10px]">
                            {member.regNo}
                          </span>
                          <span>•</span>
                          {/* Small Christian Community name */}
                          <span>SCC: {member.scc}</span>
                          <span>•</span>
                          {/* Phone number */}
                          <span>{member.phone}</span>
                        </div>
                      </div>
                      {/* Arrow icon that slides right on hover */}
                      <span className="material-symbols-outlined text-sm text-[#444748] group-hover:translate-x-1 transition-transform">
                        arrow_forward
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Default Quick Action Navigation Shortcuts
            <div>
              {/* Quick action section header */}
              <div className="text-[10px] font-bold uppercase text-[#444748] tracking-wider mb-2 px-1">
                Quick Action Shortcuts
              </div>
              <div className="space-y-1">
                {/* Render each quick action shortcut as a clickable button */}
                {quickLinks.map((link) => (
                  <button
                    key={link.title}
                    onClick={() => {
                      /** Navigate to the linked tab and close the modal */
                      onNavigate(link.tab);
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-lg border border-[#f4f3f3] hover:bg-[#f4f3f3] text-left flex items-center gap-3 transition-colors cursor-pointer"
                  >
                    {/* Material icon for the quick action */}
                    <span className="material-symbols-outlined text-base text-[#1e1e1e]">
                      {link.icon}
                    </span>
                    {/* Quick action label text */}
                    <span className="text-xs font-medium text-[#1a1c1c]">
                      {link.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls Bar */}
        <div className="px-4 py-2 border-t border-[#e1e3e3] bg-[#f9f9f9] flex justify-between items-center text-[11px] text-[#444748]">
          {/* Keyboard hint for closing the modal */}
          <span>Press ESC to exit</span>
          {/* Modal title / branding */}
          <span>Ecclesia Quick Finder</span>
        </div>
      </div>
    </div>
  );
};
