import React, { useState } from 'react';

interface AuthViewProps {
  onSuccessAuth: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccessAuth }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('fr.thomas@stmarysparish.org');
  const [password, setPassword] = useState('••••••••••••');
  const [role, setRole] = useState('Parish Administrator');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSuccessAuth();
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#ffffff] border border-[#e1e3e3] rounded-2xl shadow-xl overflow-hidden p-8 space-y-6">
        {/* Header Logo */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-2xl shadow-xs">
            †
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">
            Ecclesia CMS
          </h2>
          <p className="text-xs text-[#444748]">
            St. Mary's Parish Sacred Management Portal
          </p>
        </div>

        {/* Auth Mode Toggle */}
        <div className="flex bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-[#1e1e1e] text-white shadow-2xs' : 'text-[#444748]'
            }`}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
              mode === 'register' ? 'bg-[#1e1e1e] text-white shadow-2xs' : 'text-[#444748]'
            }`}
          >
            REGISTER STAFF
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
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

          {mode === 'register' && (
            <div>
              <label className="block text-[#1a1c1c] font-medium mb-1">Parish Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
              >
                <option value="Parish Administrator">Parish Administrator</option>
                <option value="Parish Accountant">Parish Accountant</option>
                <option value="Parish Secretary">Parish Secretary</option>
                <option value="Jumuiya Chairman">Jumuiya Chairman</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-[#444748]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[#1e1e1e]" />
              Remember Session
            </label>
            <span className="hover:underline cursor-pointer">Forgot Password?</span>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded-lg transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">login</span>
            {mode === 'login' ? 'Sign In to Central Altar' : 'Create Staff Account'}
          </button>
        </form>

        <div className="text-center text-[11px] text-[#444748] pt-2 border-t border-[#e1e3e3]">
          Authorized Parish Personnel Only • Protected by Ecclesia CMS
        </div>
      </div>
    </div>
  );
};
