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
import { authApi } from '../../services/api';

interface AuthViewProps {
  onSuccessAuth: () => void;
}

type AuthMode = 'login' | 'setPassword' | 'forgot' | 'reset';

export const AuthView: React.FC<AuthViewProps> = ({ onSuccessAuth }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Forgot-password screen
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Reset-password screen
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);

  /** Submits credentials; persists the JWT locally before handing control to App. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const loginRes = await authApi.login({ email, password });
      localStorage.setItem('ecclesia_token', loginRes.token);
      // Temp/admin-set passwords are flagged server-side: force a change first.
      if (loginRes.user.mustChangePassword) {
        setMode('setPassword');
      } else {
        onSuccessAuth();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Forced first-login password change; uses the just-entered login password. */
  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword: password, newPassword });
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
      await authApi.forgotPassword(forgotEmail);
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
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token: resetCode, newPassword });
      setResetDone(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset password.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const goTo = (next: AuthMode) => {
    setMode(next);
    setErrorMessage('');
    setForgotSent(false);
    setResetDone(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f9f9f9] animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#ffffff] border border-[#e1e3e3] rounded-2xl shadow-xl overflow-hidden p-8 space-y-6">
        {/* Header Logo */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-2xl shadow-xs">
            †
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">
            Ecclesia CMS
          </h2>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {errorMessage && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {errorMessage}
              </div>
            )}
            <div>
              <label className="block text-[#1a1c1c] font-medium mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
            </div>

            <div>
              <label className="block text-[#1a1c1c] font-medium mb-1">Password</label>
              <div className="flex items-center gap-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
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

            <div className="flex items-center justify-between text-[11px] text-[#444748]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-[#1e1e1e]" />
                Remember Session
              </label>
              <button
                type="button"
                onClick={() => goTo('forgot')}
                className="hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="material-symbols-outlined text-base">login</span>
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'setPassword' && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 text-[11px] text-amber-800">
              You are using a temporary password. Choose a new password (at least 8 characters)
              to continue.
            </div>
            {errorMessage && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleSetPasswordSubmit} className="space-y-4">
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

        {mode === 'forgot' && (
          <div className="space-y-4 text-xs">
            {forgotSent ? (
              <>
                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-[11px] text-emerald-800">
                  If an account exists for that email, a one-time reset code has been prepared.
                  Contact your parish administrator to receive your reset code.
                </div>
                <button
                  type="button"
                  onClick={() => goTo('reset')}
                  className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer"
                >
                  I have a reset code
                </button>
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
                <div className="text-[11px] text-[#444748]">
                  Enter your account email below. Your parish administrator will then provide a
                  one-time reset code.
                </div>
                {errorMessage && (
                  <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    {errorMessage}
                  </div>
                )}
                <form onSubmit={handleForgotSubmit} className="space-y-4">
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
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Submitting...' : 'Request Reset Code'}
                  </button>
                </form>
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

        {mode === 'reset' && (
          <div className="space-y-4 text-xs">
            {resetDone ? (
              <>
                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-[11px] text-emerald-800">
                  Your password has been reset successfully. You can now sign in with your new
                  password.
                </div>
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
                <div className="text-[11px] text-[#444748]">
                  Enter the reset code given to you by your parish administrator, then choose a new
                  password (at least 8 characters).
                </div>
                {errorMessage && (
                  <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    {errorMessage}
                  </div>
                )}
                <form onSubmit={handleResetSubmit} className="space-y-4">
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
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
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
