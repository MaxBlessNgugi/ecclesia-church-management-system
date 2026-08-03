import React, { useState } from 'react';
import { authApi } from '../../services/api';

interface AuthViewProps {
  onSuccessAuth: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccessAuth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const loginRes = await authApi.login({ email, password });
      localStorage.setItem('ecclesia_token', loginRes.token);
      onSuccessAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
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
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#444748]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[#1e1e1e]" />
              Remember Session
            </label>
            <span className="hover:underline cursor-pointer">Forgot Password?</span>
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
      </div>
    </div>
  );
};
