// =============================================================================
// AuthView — login / forgot-password / reset-password screens
// -----------------------------------------------------------------------------
// Rendered whenever no valid session exists. Four modes:
//   login        — email + password with show/hide toggle and inline error.
//   setPassword  — forced first-login password change (temp/admin-set passwords).
//   forgot       — asks for the user's email, posts /auth/forgot-password, then
//                  tells them to collect a one-time reset code from their admin.
//   reset        — redeems the code with a new password via /auth/reset-password.
// On successful login the JWT is stored in localStorage under `ecclesia_token`;
// onSuccessAuth is called only once any forced password change is completed.
// =============================================================================
import React, { useState } from 'react';
// React core: provides JSX support and component lifecycle.
// useState: hook for declaring local mutable state within the component.
import { authApi, storeToken } from '../../services/api';
// authApi: object containing login(), forgotPassword(), resetPassword(), and
//   changePassword() methods that wrap HTTP calls to the authentication endpoints.
// storeToken: helper that persists a JWT in localStorage (or sessionStorage)
//   so the session survives page reloads.

/**
 * Props accepted by AuthView.
 * @property onSuccessAuth - callback invoked once the user has fully authenticated
 *   (including any forced password change). The parent uses this to transition
 *   into the main application shell.
 */
interface AuthViewProps {
  onSuccessAuth: () => void;
}

/**
 * Union type representing the four visual / functional modes of the auth screen.
 *   'login'        – default email + password form
 *   'setPassword'  – first-login mandatory password change
 *   'forgot'       – email entry for password-reset initiation
 *   'reset'        – code + new-password form to finish the reset flow
 */
type AuthMode = 'login' | 'setPassword' | 'forgot' | 'reset';

export const AuthView: React.FC<AuthViewProps> = ({ onSuccessAuth }) => {
  // -------------------------------------------------------------------------
  // State — login form
  // -------------------------------------------------------------------------

  // Controls which sub-screen is rendered. Defaults to 'login' on mount.
  const [mode, setMode] = useState<AuthMode>('login');

  // Bound to the email <input>. Stores the user-typed email address.
  // Used for both the login and (indirectly) the forgot-password flows.
  const [email, setEmail] = useState('');

  // Bound to the password <input>. Stores the plaintext password as typed.
  // Also reused as `currentPassword` when the user is forced to change it.
  const [password, setPassword] = useState('');

  // Toggles the password field between type="password" (masked) and
  // type="text" (visible). Starts hidden (false).
  const [showPassword, setShowPassword] = useState(false);

  // "Remember me" checkbox. When true the JWT is stored in localStorage;
  // when false it is stored in sessionStorage (cleared on tab close).
  const [remember, setRemember] = useState(true);

  // Disables the submit button and shows a loading label while an API call
  // is in flight. Prevents duplicate submissions.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Holds the most recent error message to display in the inline error banner.
  // Cleared at the start of every new submission attempt.
  const [errorMessage, setErrorMessage] = useState('');

  // -------------------------------------------------------------------------
  // State — forgot-password screen
  // -------------------------------------------------------------------------

  // The email entered on the forgot-password form. Independent from the login
  // `email` state so the two flows do not interfere with each other.
  const [forgotEmail, setForgotEmail] = useState('');

  // When true, the forgot-password form is replaced with a success message
  // instructing the user to contact their parish administrator.
  const [forgotSent, setForgotSent] = useState(false);

  // -------------------------------------------------------------------------
  // State — reset-password screen
  // -------------------------------------------------------------------------

  // The one-time reset code provided by the parish administrator.
  // Stored as a plain string; displayed in uppercase monospace for readability.
  const [resetCode, setResetCode] = useState('');

  // The new password the user wants to set. Must be at least 8 characters.
  const [newPassword, setNewPassword] = useState('');

  // Confirmation field for the new password. Must match `newPassword` exactly
  // before the form will submit.
  const [confirmPassword, setConfirmPassword] = useState('');

  // When true the reset form is replaced with a success message and a link
  // back to the login screen.
  const [resetDone, setResetDone] = useState(false);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /** Submits credentials; persists the JWT locally before handing control to App. */
  const handleSubmit = async (e: React.FormEvent) => {
    // Prevent the browser from performing a full-page form submission.
    e.preventDefault();
    // Clear any previous error banner so the user sees a clean state.
    setErrorMessage('');
    // Disable the submit button and show "Authenticating..." label.
    setIsSubmitting(true);

    try {
      // POST /auth/login with { email, password }. On success the response
      // contains { token, user } where user includes `mustChangePassword`.
      const loginRes = await authApi.login({ email, password });
      // Persist the JWT so subsequent page loads stay authenticated.
      // `remember` controls whether it goes into localStorage or sessionStorage.
      storeToken(loginRes.token, remember);
      // If the server flags the account as needing a password change (e.g. a
      // temporary or admin-set password), transition to the setPassword mode
      // instead of calling onSuccessAuth.
      if (loginRes.user.mustChangePassword) {
        setMode('setPassword');
      } else {
        // Normal login — hand off to the parent to render the main app.
        onSuccessAuth();
      }
    } catch (error) {
      // Normalise the error: if it's a standard Error object use its message,
      // otherwise fall back to a generic string.
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setErrorMessage(message);
    } finally {
      // Re-enable the submit button regardless of success or failure.
      setIsSubmitting(false);
    }
  };

  /** Forced first-login password change; uses the just-entered login password. */
  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    // Client-side guard: ensure both password fields match before calling the API.
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      // Send the original (temporary) password as `currentPassword` so the
      // server can verify the session, along with the desired `newPassword`.
      await authApi.changePassword({ currentPassword: password, newPassword });
      // Password changed successfully — treat as full authentication.
      onSuccessAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change password.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Requests a reset code for the given email (always succeeds — anti-enumeration). */
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      // The server always returns 200 to prevent email enumeration. The actual
      // reset code is delivered out-of-band by the parish administrator.
      await authApi.forgotPassword(forgotEmail);
      // Flip to the "sent" sub-view so the user knows what to do next.
      setForgotSent(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process request.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Redeems the code with a new password, then returns to the login form. */
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    // Client-side guard: ensure both password fields match before calling the API.
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      // POST /auth/reset-password with the one-time code and the new password.
      await authApi.resetPassword({ token: resetCode, newPassword });
      // Show a success message and remove the form.
      setResetDone(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset password.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Utility to navigate between auth modes while resetting transient UI state.
   * Clears the error banner and any "sent" / "done" flags so the target screen
   * starts fresh.
   * @param next - the AuthMode to switch to
   */
  const goTo = (next: AuthMode) => {
    setMode(next);
    setErrorMessage('');
    setForgotSent(false);
    setResetDone(false);
  };

  return (
    // Full-viewport wrapper. Flexbox centres the card vertically and horizontally.
    // `min-h-screen` ensures the background covers at least the viewport height.
    // `animate-in fade-in` adds a subtle 200 ms entrance animation.
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f9f9f9] animate-in fade-in duration-200">
      {/* Auth card — constrained width, white background, rounded corners, shadow */}
      <div className="w-full max-w-md bg-[#ffffff] border border-[#e1e3e3] rounded-2xl shadow-xl overflow-hidden p-8 space-y-6">
        {/* Header Logo */}
        {/* Centred block containing the cross icon and application title */}
        <div className="text-center space-y-2">
          {/* Cross icon inside a rounded dark square — the app's visual brand mark */}
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-2xl shadow-xs">
            †
          </div>
          {/* Application name in a serif font */}
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">
            Ecclesia CMS
          </h2>
        </div>

        {/* ================================================================= */}
        {/* LOGIN MODE — default screen                                       */}
        {/* ================================================================= */}
        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Inline error banner — only rendered when errorMessage is truthy */}
            {errorMessage && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {errorMessage}
              </div>
            )}
            {/* Email field */}
            <div>
              {/* Label for the email input — not linked via htmlFor for simplicity */}
              <label className="block text-[#1a1c1c] font-medium mb-1">Email Address</label>
              {/* Native email input with browser validation (`type="email"` + `required`) */}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
            </div>

            {/* Password field with show/hide toggle */}
            <div>
              <label className="block text-[#1a1c1c] font-medium mb-1">Password</label>
              {/* Flex row holds the input and the visibility toggle button side by side */}
              <div className="flex items-center gap-2">
                {/* Password input — type switches between 'password' and 'text' */}
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
                {/* Toggle button — switches between visibility_off and visibility icons */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="px-2 py-2 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-sm">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Row containing "Remember Session" checkbox and "Forgot Password?" link */}
            <div className="flex items-center justify-between text-[11px] text-[#444748]">
              {/* Remember-me checkbox — controls JWT storage location */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-[#1e1e1e]"
                />
                Remember Session
              </label>
              {/* Navigate to the forgot-password mode */}
              <button
                type="button"
                onClick={() => goTo('forgot')}
                className="hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            {/* Primary submit button — disabled while submitting */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {/* Login icon from Material Symbols */}
              <span className="material-symbols-outlined text-base">login</span>
              {/* Dynamic label: shows "Authenticating..." while the API call is in flight */}
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ================================================================= */}
        {/* SET PASSWORD MODE — forced first-login password change              */}
        {/* ================================================================= */}
        {mode === 'setPassword' && (
          <div className="space-y-4 text-xs">
            {/* Amber warning banner explaining why the user is here */}
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 text-[11px] text-amber-800">
              You are using a temporary password. Choose a new password (at least 8 characters)
              to continue.
            </div>
            {/* Inline error banner */}
            {errorMessage && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleSetPasswordSubmit} className="space-y-4">
              {/* New password input — required, min 8 chars, browsers may offer suggestions */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>
              {/* Confirmation input — must match the new password */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>
              {/* Submit button — disabled while saving */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Saving...' : 'Save New Password'}
              </button>
            </form>
          </div>
        )}

        {/* ================================================================= */}
        {/* FORGOT PASSWORD MODE — email entry or post-submission confirmation */}
        {/* ================================================================= */}
        {mode === 'forgot' && (
          <div className="space-y-4 text-xs">
            {/* Conditional rendering: show success UI if the request was sent, */}
            {/* otherwise show the email entry form. */}
            {forgotSent ? (
              <>
                {/* Success banner — tells user to contact their admin for the code */}
                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-[11px] text-emerald-800">
                  If an account exists for that email, a one-time reset code has been prepared.
                  Contact your parish administrator to receive your reset code.
                </div>
                {/* Primary action: move to the reset-code entry screen */}
                <button
                  type="button"
                  onClick={() => goTo('reset')}
                  className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer"
                >
                  I have a reset code
                </button>
                {/* Secondary link: return to the login form */}
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full py-2 text-[11px] text-[#444748] hover:underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                {/* Instructional text before the email form */}
                <div className="text-[11px] text-[#444748]">
                  Enter your account email below. Your parish administrator will then provide a
                  one-time reset code.
                </div>
                {/* Inline error banner */}
                {errorMessage && (
                  <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    {errorMessage}
                  </div>
                )}
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  {/* Email field — independent from the login email state */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                    />
                  </div>
                  {/* Submit button — disables while the request is in flight */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Submitting...' : 'Request Reset Code'}
                  </button>
                </form>
                {/* Secondary link: return to the login form */}
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full py-2 text-[11px] text-[#444748] hover:underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* RESET PASSWORD MODE — code entry or post-reset confirmation        */}
        {/* ================================================================= */}
        {mode === 'reset' && (
          <div className="space-y-4 text-xs">
            {/* Conditional rendering: show success UI if reset succeeded, */}
            {/* otherwise show the code + password form. */}
            {resetDone ? (
              <>
                {/* Success banner — password has been updated */}
                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-[11px] text-emerald-800">
                  Your password has been reset successfully. You can now sign in with your new
                  password.
                </div>
                {/* Return to login with the new credentials */}
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer"
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                {/* Instructional text for the reset-code form */}
                <div className="text-[11px] text-[#444748]">
                  Enter the reset code given to you by your parish administrator, then choose a new
                  password (at least 8 characters).
                </div>
                {/* Inline error banner */}
                {errorMessage && (
                  <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    {errorMessage}
                  </div>
                )}
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  {/* Reset code input — monospace, uppercase, wide tracking for readability */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Reset Code</label>
                    <input
                      type="text"
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      autoComplete="off"
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] font-mono tracking-widest uppercase focus:outline-none focus:border-[#1e1e1e]"
                    />
                  </div>
                  {/* New password input — min 8 chars, required */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                    />
                  </div>
                  {/* Confirmation input — must match the new password */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                    />
                  </div>
                  {/* Submit button — disables while the reset request is in flight */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
                {/* Secondary link: return to the login form */}
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full py-2 text-[11px] text-[#444748] hover:underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
