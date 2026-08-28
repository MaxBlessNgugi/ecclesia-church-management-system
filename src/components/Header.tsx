// =============================================================================
// Header — sticky top navigation bar
// -----------------------------------------------------------------------------
// Renders the sidebar toggle, the desktop global-search trigger (Ctrl+K) and
// the user profile dropdown. The frameless window's OS-style title bar (app
// icon, title, drag region, window controls) lives in its own TitleBar.tsx
// component, rendered above this header in App.tsx.
//
// Dark mode: the header and all its surfaces ship dark:* variants driven by
// the `.dark` class on <html>, toggled from the profile menu and persisted
// to localStorage ('ecclesia_theme').
//
// Local state owns the profile dropdown, the Change Password modal and its
// form fields; the change-password flow validates client-side (match + min
// length) then calls authApi.changePassword and shows inline success/error.
// Signing out goes through onSelectTab('auth'), which App.tsx maps to clearing
// the stored token.
// =============================================================================
import React, { useEffect, useState } from 'react';
/** React core library and useState/useEffect hooks for component state and effects */
import { AuthUser, NavigationTab } from '../types';
/** AuthUser: typed shape for the authenticated user object; NavigationTab: union of all valid view keys */
import { authApi } from '../services/api';
/** API service module exposing authentication helpers including changePassword */
import { useConnectivity } from '../context/OfflineContext';

/**
 * Header component props interface.
 * Defines navigation callbacks and the search toggle.
 */
interface HeaderProps {
  /** Callback that navigates the application to the specified top-level tab */
  onSelectTab: (tab: NavigationTab) => void;
  /** Callback that toggles the sidebar drawer open/closed */
  onToggleSidebar: () => void;
  /** Callback that opens the global search modal overlay */
  onOpenSearch: () => void;
  /** Currently authenticated user object, or null/undefined when no user is signed in */
  user?: AuthUser | null;
}

/**
 * Application Header component.
 * Renders the top nav bar including navigation drawer toggle, global search
 * bar trigger (Ctrl+K), and user account profile dropdown menu. The frameless
 * window's title bar (brand + window controls) lives in TitleBar.tsx.
 *
 * Layout: sticky top bar that stays fixed during scroll, z-index layered
 * above sidebar (z-30) and below modals (z-50).
 */
export const Header: React.FC<HeaderProps> = ({
  onSelectTab,
  onToggleSidebar,
  onOpenSearch,
  user
}) => {
  // Controls visibility of the administrator profile dropdown menu
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  /** Boolean toggling the profile dropdown open/closed */

  const [showChangePassword, setShowChangePassword] = useState(false);
  /** Boolean controlling the Change Password modal overlay visibility */

  const [currentPassword, setCurrentPassword] = useState('');
  /** Text value bound to the current password input field */

  const [newPassword, setNewPassword] = useState('');
  /** Text value bound to the new password input field */

  const [confirmPassword, setConfirmPassword] = useState('');
  /** Text value bound to the confirm new password input field */

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  /** Loading flag that disables the submit button and shows 'Updating...' while the API call is in flight */

  const [passwordError, setPasswordError] = useState('');
  /** Error message displayed when client-side or server-side password change validation fails */

  const [passwordSuccess, setPasswordSuccess] = useState('');
  /** Success message shown after a password change completes successfully */

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  /** Toggles visibility of the current password field between text and password type */

  const [showNewPw, setShowNewPw] = useState(false);
  /** Toggles visibility of the new password field between text and password type */

  const [showConfirmPw, setShowConfirmPw] = useState(false);
  /** Toggles visibility of the confirm password field between text and password type */

  // Dark mode state (persisted to localStorage, drives the .dark class on <html>)
  const [isDark, setIsDark] = useState(false);
  /** Whether dark mode is active for the whole shell */

  // Connectivity status from global context
  const { status: connectivityStatus } = useConnectivity();

  /** Restore the persisted theme choice on mount. */
  useEffect(() => {
    try {
      if (localStorage.getItem('ecclesia_theme') === 'dark') setIsDark(true);
    } catch {
      /* storage unavailable — stay in light mode */
    }
  }, []);

  /** Apply the theme class to <html> and persist the choice. */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('ecclesia_theme', isDark ? 'dark' : 'light');
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, [isDark]);

  /**
   * Handles the password change form submission.
   * Performs client-side validation (passwords match, minimum 8 characters),
   * then calls authApi.changePassword. On success, clears form fields and
   * auto-closes the modal after 2 seconds. On failure, displays the error.
   * @param e - React form submission event
   */
  const handleChangePassword = async (e: React.FormEvent) => {
    /** Prevent default browser form submission to handle submission via JavaScript */
    e.preventDefault();
    /** Clear any previous error/success messages before re-validating */
    setPasswordError('');
    setPasswordSuccess('');
    /** Validate that the new password and confirmation match */
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    /** Validate minimum password length requirement */
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    /** Set loading state to true while the API call is in progress */
    setIsChangingPassword(true);
    try {
      /** Call the API to change the password with current and new credentials */
      await authApi.changePassword({ currentPassword, newPassword });
      /** Display success message after password is updated */
      setPasswordSuccess('Password updated successfully.');
      /** Clear form fields after successful password change */
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      /** Auto-close the modal after a 2-second delay to allow user to see the success message */
      setTimeout(() => setShowChangePassword(false), 2000);
    } catch (error) {
      /** Set error message, handling both Error instances and unknown error types */
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      /** Reset loading state regardless of success or failure */
      setIsChangingPassword(false);
    }
  };

  return (
    /** Unified title bar: white bar, slate borders, app-drag region for the frameless window */
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pl-4 pr-1 flex items-center justify-between sticky top-0 z-30 shadow-sm select-none">
      {/* Sidebar navigation toggle and main application branding */}
      <div className="flex items-center gap-3">
        {/* Sidebar hamburger toggle button — visible on all breakpoints */}
        <button
          onClick={onToggleSidebar}
          className="no-drag p-2 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Toggle Navigation Menu"
          title="Toggle Navigation Menu"
        >
          <span className="material-symbols-outlined">menu</span>
          {/* Material Symbols icon for the hamburger menu */}
        </button>

      </div>

      {/* Central Global Search bar trigger for desktop viewports */}
      <div className="no-drag hidden md:flex items-center flex-1 max-w-md mx-6">
        {/* Styled button that opens the global search modal — hidden on mobile */}
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center gap-3 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200/80 dark:border-slate-700 text-sm transition-colors cursor-pointer"
        >
          {/* Search icon inside the trigger button */}
          <span className="material-symbols-outlined text-base text-slate-500 dark:text-slate-400">search</span>
          {/* Placeholder text indicating searchable content */}
          <span className="flex-1 text-left text-xs">Search members, records, forms...</span>
          {/* Keyboard shortcut badge — visible on sm+ viewports */}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded shadow-sm font-mono">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right controls: Connectivity status, Mobile search, Profile */}
      <div className="no-drag flex items-center gap-2 relative">
        {/* Connectivity status badge — subtle pill with an indicator dot */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide border ${
            connectivityStatus === 'online'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
          }`}
          title={
            connectivityStatus === 'online'
              ? 'Backend is reachable. All changes sync immediately.'
              : 'Backend unreachable — changes will not be saved until the server is available.'
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectivityStatus === 'online'
                ? 'bg-emerald-500'
                : 'bg-amber-500'
            }`}
          />
          {connectivityStatus === 'online' && 'Online'}
          {connectivityStatus === 'offline' && 'Offline'}
        </div>

        {/* Mobile search trigger button — only visible below md breakpoint */}
        <button
          onClick={onOpenSearch}
          className="md:hidden p-2 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
          title="Search"
          aria-label="Search"
        >
          <span className="material-symbols-outlined">search</span>
        </button>

        {/* User profile button & expandable dropdown menu */}
        <div className="relative">
          {/* Profile trigger button — subtle pill with hover/active states */}
          <button
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center gap-2.5 pl-1.5 pr-2 py-1 rounded-full border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200/70 dark:active:bg-slate-700/70 transition-colors cursor-pointer"
          >
            {/* User initials avatar circle */}
            <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-medium text-xs">
              {user ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
            </div>
            {/* User name and role text — hidden on small screens */}
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-50 leading-tight">
                {user?.name ?? 'Guest'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {user ? (user.title ?? user.role[0].toUpperCase() + user.role.slice(1).replace('_', ' ')) : 'Not signed in'}
              </div>
            </div>
            {/* Dropdown chevron indicator */}
            <span className="material-symbols-outlined text-sm text-slate-400">
              expand_more
            </span>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Dropdown header displaying user name, email, and role badge */}
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-50">{user?.name ?? 'Guest'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{user?.email ?? 'Not signed in'}</p>
                {/* Role badge pill */}
                <span className="inline-block mt-1 px-2 py-0.5 text-[9px] bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded font-medium">
                  {user ? (user.title ?? user.role[0].toUpperCase() + user.role.slice(1).replace('_', ' ')) : 'Guest'}
                </span>
              </div>

              {/* Parish Dashboard navigation link */}
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onSelectTab('dashboard');
                }}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">dashboard</span>
                Parish Dashboard
              </button>

              {/* Rights & Permissions (Administration) navigation link */}
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onSelectTab('administration');
                }}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                Rights & Permissions
              </button>

              {/* Appearance — dark/light mode toggle */}
              <button
                onClick={() => setIsDark((d) => !d)}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </button>

              {/* Change Password action — opens the password change modal */}
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  setShowChangePassword(true);
                }}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">lock_reset</span>
                Change Password
              </button>

              {/* Visual separator before the destructive sign-out action */}
              <div className="border-t border-slate-200 dark:border-slate-700 my-1" />

              {/* Sign Out / Switch User action — styled in red to indicate destructive intent */}
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onSelectTab('auth');
                }}
                className="w-full text-left px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2 cursor-pointer"
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
        <div className="no-drag fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50 uppercase">Change Password</h4>
            {/* Success notification banner — shown after password update completes */}
            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded text-xs text-emerald-800 dark:text-emerald-400">
                {passwordSuccess}
              </div>
            )}
            {/* Error notification banner — shown on validation or API failure */}
            {passwordError && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded text-xs text-red-700 dark:text-red-400">
                {passwordError}
              </div>
            )}
            {/* Password change form with three input fields */}
            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              {/* Current Password field group */}
              <div>
                <label className="block text-slate-900 dark:text-slate-100 font-medium mb-1">Current Password</label>
                <div className="flex items-center gap-2">
                  {/* Current password text input — type toggled by showCurrentPw */}
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-900 dark:focus:border-slate-300"
                  />
                  {/* Toggle visibility button for current password */}
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="px-2 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    title={showCurrentPw ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showCurrentPw ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
              {/* New Password field group */}
              <div>
                <label className="block text-slate-900 dark:text-slate-100 font-medium mb-1">New Password</label>
                <div className="flex items-center gap-2">
                  {/* New password text input with 8-character minimum */}
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-900 dark:focus:border-slate-300"
                  />
                  {/* Toggle visibility button for new password */}
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="px-2 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    title={showNewPw ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showNewPw ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
              {/* Confirm New Password field group */}
              <div>
                <label className="block text-slate-900 dark:text-slate-100 font-medium mb-1">Confirm New Password</label>
                <div className="flex items-center gap-2">
                  {/* Confirm password text input */}
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-900 dark:focus:border-slate-300"
                  />
                  {/* Toggle visibility button for confirm password */}
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="px-2 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    title={showConfirmPw ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showConfirmPw ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
              {/* Form action buttons row — Cancel and Submit */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                {/* Cancel button — closes modal and clears any messages */}
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="px-3 py-1.5 text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded cursor-pointer"
                >
                  Cancel
                </button>
                {/* Submit button — disabled during API call, shows loading text */}
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-4 py-1.5 font-bold text-white dark:text-slate-900 bg-slate-900 dark:bg-slate-100 rounded cursor-pointer disabled:opacity-70"
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
