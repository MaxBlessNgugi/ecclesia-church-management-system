// =============================================================================
// Ecclesia CMS — OfflineContext
// =============================================================================
//
// PURPOSE
//   Provides global online/offline/syncing state to the entire React tree.
//   Polls the backend health endpoint every 20 seconds to detect connectivity.
//   Exposes the pending queue count so the UI can show sync badges and warnings.
//
// STATE MACHINE
//   ┌─────────┐   backend reachable   ┌────────┐   queue empty   ┌────────┐
//   │ offline │ ──────────────────────▶│ online │ ──────────────▶│ online │
//   └─────────┘                        └────────┘                └────────┘
//        ▲                                  │                         │
//        │          backend unreachable     │   queue has items       │
//        └──────────────────────────────────┘─────────────────────────┘
//
// RELATED FILES
//   - src/lib/db.ts              → Dexie queue helpers
//   - src/services/sync.ts       → Background sync processor
//   - src/components/Header.tsx  → Renders the status indicator badge
// =============================================================================
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { getPendingCount } from '../lib/db';

export type ConnectivityStatus = 'online' | 'offline' | 'syncing';

export interface OfflineContextValue {
  /** Current connectivity status */
  status: ConnectivityStatus;
  /** Number of items in the offline write queue */
  pendingCount: number;
  /** Last successful sync timestamp (ISO string) */
  lastSyncedAt: string | null;
  /** Force a connectivity check right now */
  checkConnectivity: () => Promise<void>;
  /** Called by the sync service when it starts processing */
  setSyncing: (syncing: boolean) => void;
  /** Refresh the pending count display */
  refreshPendingCount: () => Promise<void>;
}

export const OfflineContext = createContext<OfflineContextValue>({
  status: 'online',
  pendingCount: 0,
  lastSyncedAt: null,
  checkConnectivity: async () => {},
  setSyncing: () => {},
  refreshPendingCount: async () => {},
});

const HEALTH_INTERVAL_MS = 20_000; // 20 seconds
const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ConnectivityStatus>(
    navigator.onLine ? 'online' : 'offline'
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Check backend health by hitting /api/health (or /health). */
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
      if (res.ok) {
        setStatus(isSyncingRef.current ? 'syncing' : 'online');
        setLastSyncedAt(new Date().toISOString());
      } else {
        setStatus(isSyncingRef.current ? 'syncing' : 'offline');
      }
    } catch {
      setStatus(isSyncingRef.current ? 'syncing' : 'offline');
    }
  }, []);

  /** Refresh the pending count from IndexedDB. */
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  /** Toggle syncing state (called by sync service). */
  const setSyncing = useCallback(
    (syncing: boolean) => {
      isSyncingRef.current = syncing;
      setStatus(syncing ? 'syncing' : navigator.onLine ? 'online' : 'offline');
    },
    []
  );

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

  // Refresh pending count on mount and whenever connectivity changes
  useEffect(() => {
    void refreshPendingCount();
  }, [status, refreshPendingCount]);

  return (
    <OfflineContext.Provider
      value={{ status, pendingCount, lastSyncedAt, checkConnectivity, setSyncing, refreshPendingCount }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

/** Convenience hook for consuming components. */
export const useOffline = () => React.useContext(OfflineContext);
