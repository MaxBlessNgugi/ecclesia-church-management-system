// =============================================================================
// Ecclesia CMS — ChristiansContext
// =============================================================================
//
// PURPOSE
//   Owns the Christian/parishioner registry: the list, loading state, CRUD
//   handlers, and Socket.IO realtime subscription. Extracted from DataContext
//   to reduce its size and make the Christian domain self-contained.
//
// STATE EXPOSED
//   christians, isChristiansLoading
//
// ACTIONS EXPOSED
//   handleAddChristian, handleDeleteChristian, handleTransferChristian,
//   handleUpdateSacraments, handleRecordDeath
//
// RELATED FILES
//   src/context/DataContext.tsx      → Calls loadChristians in its bulk loader
//   src/hooks/useRealtime.ts        → Socket.IO resource subscriptions
//   src/services/api.ts             → christiansApi, deathsApi, requestWithQueue
//   src/components/views/ChristianView.tsx → Consumes this context
// =============================================================================
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ChristianRecord, DeathRecord } from '../types';
import {
  christiansApi,
  deathsApi,
  requestWithQueue,
} from '../services/api';
import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from './AuthContext';

// ── Context shape ───────────────────────────────────────────────────────────

interface ChristiansContextValue {
  christians: ChristianRecord[];
  isChristiansLoading: boolean;

  // Actions
  handleAddChristian: (m: ChristianRecord) => Promise<void>;
  handleDeleteChristian: (id: string) => Promise<void>;
  handleTransferChristian: (memberId: string, dest: { localChurch: string; scc: string }) => Promise<void>;
  handleUpdateSacraments: (memberId: string, data: Partial<ChristianRecord>) => Promise<void>;
  handleRecordDeath: (death: DeathRecord) => Promise<void>;
}

const ChristiansContext = createContext<ChristiansContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export const ChristiansProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [christians, setChristians] = useState<ChristianRecord[]>([]);
  const [isChristiansLoading, setIsChristiansLoading] = useState(true);

  // Gate data loading on auth — only fetch when authenticated.
  const { isAuthenticated, isAuthChecking } = useAuth();

  // Initial load (only after auth is confirmed)
  useEffect(() => {
    if (isAuthChecking || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setIsChristiansLoading(true);
      try {
        const data = await christiansApi.list();
        if (!cancelled) setChristians(data);
      } catch (error) {
        console.error('Failed to load christians', error);
      }
      if (!cancelled) setIsChristiansLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, isAuthChecking]);

  // ── Real-time listener (Socket.IO) ──────────────────────────────────────

  useRealtime('christians', ({ action, data }) => {
    if (action === 'created') setChristians(prev => [data, ...prev]);
    if (action === 'updated') setChristians(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c));
    if (action === 'deleted') setChristians(prev => prev.filter(c => c.id !== data.id));
  });

  // ── Mutation handlers ───────────────────────────────────────────────────

  const handleAddChristian = useCallback(async (newMember: ChristianRecord) => {
    try {
      await requestWithQueue<ChristianRecord>(
        'christian', 'create', '/christians', 'POST',
        newMember as unknown as Record<string, unknown>,
        (created) => setChristians(prev => [created as ChristianRecord, ...prev])
      );
    } catch (error) {
      console.error('Failed to add christian', error);
      alert(error instanceof Error ? error.message : 'Failed to add christian record');
    }
  }, []);

  const handleDeleteChristian = useCallback(async (id: string) => {
    try {
      await requestWithQueue(
        'christian', 'delete', `/christians/${id}`, 'DELETE', {},
        () => setChristians(prev => prev.filter(c => c.id !== id))
      );
    } catch (error) {
      console.error('Failed to delete christian', error);
      alert(error instanceof Error ? error.message : 'Failed to delete christian record');
    }
  }, []);

  const handleTransferChristian = useCallback(async (
    memberId: string,
    dest: { localChurch: string; scc: string }
  ) => {
    setChristians(prev => {
      const member = prev.find(c => c.id === memberId);
      if (!member) return prev;
      requestWithQueue(
        'transfer', 'create', '/transfers', 'POST',
        {
          christianId: memberId,
          memberName: `${member.baptismalName} ${member.sirName}`,
          diocese: member.diocese,
          parish: member.parish,
          localChurch: dest.localChurch,
          scc: dest.scc,
          date: new Date().toISOString().split('T')[0],
        },
        () => {
          setChristians(p =>
            p.map(c =>
              c.id === memberId
                ? { ...c, status: 'Transferred', localChurch: dest.localChurch, scc: dest.scc }
                : c
            )
          );
        }
      ).catch(error => {
        console.error('Failed to record transfer', error);
        alert(error instanceof Error ? error.message : 'Failed to record transfer');
      });
      return prev;
    });
  }, []);

  const handleUpdateSacraments = useCallback(async (memberId: string, data: Partial<ChristianRecord>) => {
    try {
      await requestWithQueue(
        'christian', 'update', `/christians/${memberId}/sacraments`, 'PATCH',
        data as unknown as Record<string, unknown>,
        () => setChristians(prev => prev.map(c => c.id === memberId ? { ...c, ...data } : c))
      );
    } catch (error) {
      console.error('Failed to update sacraments', error);
      alert(error instanceof Error ? error.message : 'Failed to update sacraments');
    }
  }, []);

  const handleRecordDeath = useCallback(async (death: DeathRecord) => {
    try {
      await requestWithQueue<DeathRecord>(
        'death', 'create', '/deaths', 'POST',
        death as unknown as Record<string, unknown>,
        (created) => {
          // Also update the christian's status to Deceased
          setChristians(prev =>
            prev.map(c => c.id === death.christianId ? { ...c, status: 'Deceased' } : c)
          );
        }
      );
    } catch (error) {
      console.error('Failed to record death', error);
      alert(error instanceof Error ? error.message : 'Failed to record death');
    }
  }, []);

  return (
    <ChristiansContext.Provider
      value={{
        christians,
        isChristiansLoading,
        handleAddChristian,
        handleDeleteChristian,
        handleTransferChristian,
        handleUpdateSacraments,
        handleRecordDeath,
      }}
    >
      {children}
    </ChristiansContext.Provider>
  );
};

/** Convenience hook for consuming components. */
export function useChristians(): ChristiansContextValue {
  const ctx = useContext(ChristiansContext);
  if (!ctx) throw new Error('useChristians must be used within a ChristiansProvider');
  return ctx;
}
