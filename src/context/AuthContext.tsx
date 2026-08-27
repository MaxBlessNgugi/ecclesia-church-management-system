// =============================================================================
// Ecclesia CMS — AuthContext
// =============================================================================
//
// PURPOSE
//   Centralizes authentication state and session lifecycle so App.tsx stays
//   thin. Handles JWT restore, login success, password-change gate, parish
//   setup gate, and logout.
//
// STATE EXPOSED
//   currentUser, isAuthenticated, isAuthChecking, mustChangePassword, needsSetup
//
// ACTIONS EXPOSED
//   handleAuthSuccess, handlePasswordChangeComplete, handleSetupComplete, logout
//
// RELATED FILES
//   src/App.tsx                 → Consumes this context for gate logic + layout
//   src/services/api.ts         → authApi, getStoredToken, clearStoredToken
//   src/lib/parish.ts           → checkParishSetup
// =============================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser } from '../types';
import {
  authApi,
  clearStoredToken,
  getStoredToken,
} from '../services/api';
import { checkParishSetup } from '../lib/parish';

interface AuthContextValue {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  mustChangePassword: boolean;
  needsSetup: boolean;
  /** Called after a successful login or register — resolves session + seeds data. */
  handleAuthSuccess: () => Promise<void>;
  /** Called after the user completes the forced password change. */
  handlePasswordChangeComplete: () => Promise<void>;
  /** Called after the parish setup wizard completes. */
  handleSetupComplete: () => Promise<void>;
  /** Clears token and resets all auth state. */
  logout: () => void;
  /** Callback to trigger data loading after auth (set by DataContext). */
  onDataReady: React.MutableRefObject<(() => Promise<void>) | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Mutable ref so DataContext can register its loadDashboardData without
  // causing a circular dependency or re-render cascade.
  const onDataReady = React.useRef<(() => Promise<void>) | null>(null);

  /** Shared logic: resolve session → check password gate → check setup → load data. */
  const resolveSession = useCallback(async (me: AuthUser) => {
    setCurrentUser(me);
    if (me.mustChangePassword) {
      setMustChangePassword(true);
      setIsAuthenticated(true);
      return;
    }
    setMustChangePassword(false);

    const { needsSetup: setupNeeded } = await checkParishSetup();
    if (setupNeeded) {
      setNeedsSetup(true);
      return;
    }
    setNeedsSetup(false);

    setIsAuthenticated(true);
    // Trigger data loading via the callback registered by DataContext
    if (onDataReady.current) {
      await onDataReady.current();
    }
  }, []);

  /** Called after AuthView login/register succeeds. */
  const handleAuthSuccess = useCallback(async () => {
    try {
      const me = await authApi.me();
      await resolveSession(me);
    } catch {
      setCurrentUser(null);
      setIsAuthenticated(false);
    }
  }, [resolveSession]);

  /** Called after forced password change completes. */
  const handlePasswordChangeComplete = useCallback(async () => {
    setMustChangePassword(false);
    await handleAuthSuccess();
  }, [handleAuthSuccess]);

  /** Called after parish setup wizard completes. */
  const handleSetupComplete = useCallback(async () => {
    setNeedsSetup(false);
    setIsAuthenticated(true);
    if (onDataReady.current) {
      await onDataReady.current();
    }
  }, []);

  /** Clears the session and returns to the auth gate. */
  const logout = useCallback(() => {
    clearStoredToken();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setMustChangePassword(false);
    setNeedsSetup(false);
  }, []);

  // ── Restore session on mount ────────────────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      const token = getStoredToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsAuthChecking(false);
        return;
      }
      try {
        const me = await authApi.me();
        await resolveSession(me);
      } catch {
        clearStoredToken();
        setIsAuthenticated(false);
      } finally {
        setIsAuthChecking(false);
      }
    };
    void restoreSession();
  }, [resolveSession]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        isAuthChecking,
        mustChangePassword,
        needsSetup,
        handleAuthSuccess,
        handlePasswordChangeComplete,
        handleSetupComplete,
        logout,
        onDataReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/** Convenience hook for consuming components. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
