// =============================================================================
// Header — sticky top app bar
// -----------------------------------------------------------------------------
// Renders the sidebar toggle, brand (clicking it returns to Dashboard), the
// desktop global-search trigger (Ctrl+K) and the user profile dropdown.
// Local state owns the profile dropdown, the Change Password modal and its
// form fields; the change-password flow validates client-side (match + min
// length) then calls authApi.changePassword and shows inline success/error.
// Signing out goes through onSelectTab('auth'), which App.tsx maps to clearing
// the stored token.
// =============================================================================
import React, { useState } from 'react';
import { AuthUser, NavigationTab } from '../types';
import { authApi } from '../services/api';

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
  user?: AuthUser | null;
}

/**
 * Application Header component.
 * Renders the top app bar including navigation drawer toggle, brand logo,
 * global search bar trigger (Ctrl+K), and user account profile dropdown menu.
 */
export const Header: React.FC<HeaderProps> = ({
  onSelectTab,
  onToggleSidebar,
  onOpenSearch,
  user
}) => {
  // Controls visibility of the administrator profile dropdown menu
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPasswordSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setShowChangePassword(false), 2000);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

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
              {user ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-[#1a1c1c] leading-tight">
                {user?.name ?? 'Guest'}
              </div>
              <div className="text-[10px] text-[#444748]">
                {user ? (user.title ?? user.role[0].toUpperCase() + user.role.slice(1).replace('_', ' ')) : 'Not signed in'}
              </div>
            </div>
            <span className="material-symbols-outlined text-sm text-[#444748]">
              expand_more
            </span>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#e1e3e3] rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-[#e1e3e3] bg-[#f4f3f3]">
                <p className="text-xs font-bold text-[#1a1c1c]">{user?.name ?? 'Guest'}</p>
                <p className="text-[11px] text-[#444748]">{user?.email ?? 'Not signed in'}</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-[9px] bg-[#1e1e1e] text-white rounded font-medium">
                  {user ? (user.title ?? user.role[0].toUpperCase() + user.role.slice(1).replace('_', ' ')) : 'Guest'}
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

               <button
                 onClick={() => {
                   setShowProfileMenu(false);
                   setShowChangePassword(true);
                 }}
                 className="w-full text-left px-4 py-2 text-xs text-[#1a1c1c] hover:bg-[#f4f3f3] flex items-center gap-2 cursor-pointer"
               >
                 <span className="material-symbols-outlined text-sm">lock_reset</span>
                 Change Password
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

       {/* CHANGE PASSWORD MODAL */}
       {showChangePassword && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
           <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
             <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Change Password</h4>
             {passwordSuccess && (
               <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-800">
                 {passwordSuccess}
               </div>
             )}
             {passwordError && (
               <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-700">
                 {passwordError}
               </div>
             )}
              <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Current Password</label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="px-2 py-2 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                      title={showCurrentPw ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {showCurrentPw ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">New Password</label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="px-2 py-2 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                      title={showNewPw ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {showNewPw ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Confirm New Password</label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showConfirmPw ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      className="px-2 py-2 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                      title={showConfirmPw ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {showConfirmPw ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
               <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                 <button
                   type="button"
                   onClick={() => {
                     setShowChangePassword(false);
                     setPasswordError('');
                     setPasswordSuccess('');
                   }}
                   className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                 >
                   Cancel
                 </button>
                 <button
                   type="submit"
                   disabled={isChangingPassword}
                   className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded cursor-pointer disabled:opacity-70"
                 >
                   {isChangingPassword ? 'Updating...' : 'Update Password'}
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}
     </header>
   );
 };
