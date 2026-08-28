// =============================================================================
// Ecclesia CMS — ConnectivityContext
// =============================================================================
//
// PURPOSE
//   Provides global online/offline status to the React tree so UI components
//   can display a connection indicator. Polls the backend health endpoint
//   periodically to confirm the server is reachable.
//
// RELATED FILES
//   - src/components/Header.tsx  → Renders the status badge
//   - src/components/Sidebar.tsx → Renders status in footer
// =============================================================================
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';

export type ConnectivityStatus = 'online' | 'offline';

export interface ConnectivityContextValue {
  /** Current connectivity status */
  status: ConnectivityStatus;
  /** Force a connectivity check right now */
  checkConnectivity: () => Promise<void>;
}

export const ConnectivityContext = createContext<ConnectivityContextValue>({
  status: navigator.onLine ? 'online' : 'offline',
  checkConnectivity: async () => {},
});

const HEALTH_INTERVAL_MS = 20_000; // 20 seconds
const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ConnectivityStatus>(
    navigator.onLine ? 'online' : 'offline'
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Check backend health by hitting /api/health. */
  const checkConnectivity = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${BASE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timeout);
      setStatus(res.ok ? 'online' : 'offline');
    } catch {
      setStatus('offline');
    }
  }, []);

  // Poll health endpoint periodically
  useEffect(() => {
    void checkConnectivity();
    intervalRef.current = setInterval(() => {
      void checkConnectivity();
    }, HEALTH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkConnectivity]);

  // Listen to browser online/offline events for instant detection
  useEffect(() => {
    const handleOnline = () => void checkConnectivity();
    const handleOffline = () => setStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnectivity]);

  return (
    <ConnectivityContext.Provider value={{ status, checkConnectivity }}>
      {children}
    </ConnectivityContext.Provider>
  );
};

/** Convenience hook for consuming components. */
export const useConnectivity = () => React.useContext(ConnectivityContext);
