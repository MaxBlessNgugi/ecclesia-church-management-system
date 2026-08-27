// =============================================================================
// Ecclesia CMS — DataContext
// =============================================================================
//
// PURPOSE
//   Owns every shared data array (Christians, deposits, creditors, debtors,
//   expenses, deaths), the loadDashboardData fetcher, all optimistic mutation
//   handlers, and the Socket.IO realtime subscriptions that patch local state.
//
//   App.tsx no longer holds any of this state — it just reads from context and
//   passes slice references to panel components.
//
// RELATED FILES
//   src/context/AuthContext.tsx    → Registers onDataReady callback to trigger loadData
//   src/hooks/useRealtime.ts      → Socket.IO resource subscriptions
//   src/services/api.ts           → Typed API clients
//   src/App.tsx                   → Consumes DataContext for panels + handlers
// =============================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ChristianRecord,
  ContributionRecord,
  CreditorRecord,
  DeathRecord,
  DebtorRecord,
  DepositRecord,
  ExpenseRecord,
} from '../types';
import {
  christiansApi,
  creditorsApi,
  deathsApi,
  debtorsApi,
  depositsApi,
  expensesApi,
  cacheApiResponse,
  getCachedResponse,
  requestWithQueue,
} from '../services/api';
import { useRealtime } from '../hooks/useRealtime';
import { getPendingCount } from '../lib/db';
import { useAuth } from './AuthContext';

interface DataContextValue {
  // ── Data arrays ───────────────────────────────────────────────────────────
  christians: ChristianRecord[];
  deposits: DepositRecord[];
  creditors: CreditorRecord[];
  debtors: DebtorRecord[];
  expenses: ExpenseRecord[];
  deathRecords: DeathRecord[];

  // ── Setters (used by realtime + mutations) ─────────────────────────────────
  setChristians: React.Dispatch<React.SetStateAction<ChristianRecord[]>>;
  setDeposits: React.Dispatch<React.SetStateAction<DepositRecord[]>>;
  setCreditors: React.Dispatch<React.SetStateAction<CreditorRecord[]>>;
  setDebtors: React.Dispatch<React.SetStateAction<DebtorRecord[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
  setDeathRecords: React.Dispatch<React.SetStateAction<DeathRecord[]>>;

  // ── Actions ───────────────────────────────────────────────────────────────
  loadData: () => Promise<void>;
  handleAddChristian: (m: ChristianRecord) => Promise<void>;
  handleDeleteChristian: (id: string) => Promise<void>;
  handleRecordPayment: (p: ContributionRecord) => Promise<void>;
  handleTransferChristian: (memberId: string, dest: { localChurch: string; scc: string }) => Promise<void>;
  handleUpdateSacraments: (memberId: string, data: Partial<ChristianRecord>) => Promise<void>;
  handleRecordDeath: (death: DeathRecord) => Promise<void>;
  handleAddDeposit: (d: DepositRecord) => Promise<void>;
  handleAddCreditor: (c: CreditorRecord) => Promise<void>;
  handleMarkCreditorPaid: (id: string) => Promise<void>;
  handleRecordDebtorPayment: (debtorId: string, amountPaid: number) => Promise<void>;
  handleAddExpense: (e: ExpenseRecord) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { onDataReady, currentUser } = useAuth();

  // ── Data arrays ───────────────────────────────────────────────────────────
  const [christians, setChristians] = useState<ChristianRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [creditors, setCreditors] = useState<CreditorRecord[]>([]);
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [deathRecords, setDeathRecords] = useState<DeathRecord[]>([]);

  // ── Load dashboard data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [christiansRes, depositsRes, creditorsRes, debtorsRes, expensesRes, deathsRes] =
        await Promise.all([
          christiansApi.list(),
          depositsApi.list(),
          creditorsApi.list(),
          debtorsApi.list(),
          expensesApi.list(),
          deathsApi.list(),
        ]);
      setChristians(christiansRes);
      setDeposits(depositsRes);
      setCreditors(creditorsRes);
      setDebtors(debtorsRes);
      setExpenses(expensesRes);
      setDeathRecords(deathsRes);

      // Cache for offline fallback
      await Promise.all([
        cacheApiResponse('christians', christiansRes),
        cacheApiResponse('deposits', depositsRes),
        cacheApiResponse('creditors', creditorsRes),
        cacheApiResponse('debtors', debtorsRes),
        cacheApiResponse('expenses', expensesRes),
        cacheApiResponse('deaths', deathsRes),
      ]);
    } catch (error) {
      console.error('Failed to load church data from the backend', error);
      // Fallback to IndexedDB cache
      try {
        const [cc, cd, cr, cb, ce, cde] = await Promise.all([
          getCachedResponse<ChristianRecord[]>('christians'),
          getCachedResponse<DepositRecord[]>('deposits'),
          getCachedResponse<CreditorRecord[]>('creditors'),
          getCachedResponse<DebtorRecord[]>('debtors'),
          getCachedResponse<ExpenseRecord[]>('expenses'),
          getCachedResponse<DeathRecord[]>('deaths'),
        ]);
        if (cc) setChristians(cc);
        if (cd) setDeposits(cd);
        if (cr) setCreditors(cr);
        if (cb) setDebtors(cb);
        if (ce) setExpenses(ce);
        if (cde) setDeathRecords(cde);
      } catch {
        // Cache read also failed — user sees empty state
      }
    }
  }, []);

  // Register loadData with AuthContext so it can trigger data loading after auth
  useEffect(() => {
    onDataReady.current = loadData;
    return () => { onDataReady.current = null; };
  }, [loadData, onDataReady]);

  // ── Real-time listeners (Socket.IO) ──────────────────────────────────────
  useRealtime('christians', ({ action, data }) => {
    if (action === 'created') setChristians(prev => [data, ...prev]);
    if (action === 'updated') setChristians(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c));
    if (action === 'deleted') setChristians(prev => prev.filter(c => c.id !== data.id));
  });
  useRealtime('deposits', ({ action, data }) => {
    if (action === 'created') setDeposits(prev => [data, ...prev]);
    if (action === 'updated') setDeposits(prev => prev.map(d => d.id === data.id ? { ...d, ...data } : d));
    if (action === 'deleted') setDeposits(prev => prev.filter(d => d.id !== data.id));
  });
  useRealtime('creditors', ({ action, data }) => {
    if (action === 'created') setCreditors(prev => [data, ...prev]);
    if (action === 'updated') setCreditors(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c));
    if (action === 'deleted') setCreditors(prev => prev.filter(c => c.id !== data.id));
  });
  useRealtime('debtors', ({ action, data }) => {
    if (action === 'created') setDebtors(prev => [data, ...prev]);
    if (action === 'updated') setDebtors(prev => prev.map(d => d.id === data.id ? { ...d, ...data } : d));
    if (action === 'deleted') setDebtors(prev => prev.filter(d => d.id !== data.id));
  });
  useRealtime('expenses', ({ action, data }) => {
    if (action === 'created') setExpenses(prev => [data, ...prev]);
    if (action === 'updated') setExpenses(prev => prev.map(e => e.id === data.id ? { ...e, ...data } : e));
    if (action === 'deleted') setExpenses(prev => prev.filter(e => e.id !== data.id));
  });
  useRealtime('deaths', ({ action, data }) => {
    if (action === 'created') setDeathRecords(prev => [data, ...prev]);
    if (action === 'deleted') setDeathRecords(prev => prev.filter(d => d.id !== data.id));
  });
  useRealtime('settings', ({ action }) => {
    if (action === 'updated') {
      window.dispatchEvent(new CustomEvent('parish-settings-changed'));
    }
  });

  // ── Unsynced-changes warning ──────────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      const count = await getPendingCount();
      if (count > 0) {
        e.preventDefault();
        e.returnValue = `You have ${count} unsynced change${count === 1 ? '' : 's'}. If you close now, these changes will be lost. Are you sure?`;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Mutation handlers ─────────────────────────────────────────────────────

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

  const handleRecordPayment = useCallback(async (payment: ContributionRecord) => {
    try {
      await requestWithQueue<ContributionRecord>(
        'contribution', 'create', '/contributions', 'POST',
        payment as unknown as Record<string, unknown>
      );
    } catch (error) {
      console.error('Failed to record payment', error);
      alert(error instanceof Error ? error.message : 'Failed to record payment');
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
          setDeathRecords(prev => [created as DeathRecord, ...prev]);
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

  const handleAddDeposit = useCallback(async (deposit: DepositRecord) => {
    try {
      await requestWithQueue<DepositRecord>(
        'deposit', 'create', '/deposits', 'POST',
        deposit as unknown as Record<string, unknown>,
        (created) => setDeposits(prev => [created as DepositRecord, ...prev])
      );
    } catch (error) {
      console.error('Failed to add deposit', error);
      alert(error instanceof Error ? error.message : 'Failed to add deposit');
    }
  }, []);

  const handleAddCreditor = useCallback(async (creditor: CreditorRecord) => {
    try {
      await requestWithQueue<CreditorRecord>(
        'creditor', 'create', '/creditors', 'POST',
        creditor as unknown as Record<string, unknown>,
        (created) => setCreditors(prev => [created as CreditorRecord, ...prev])
      );
    } catch (error) {
      console.error('Failed to add creditor', error);
      alert(error instanceof Error ? error.message : 'Failed to add creditor');
    }
  }, []);

  const handleMarkCreditorPaid = useCallback(async (creditorId: string) => {
    try {
      await requestWithQueue(
        'creditor', 'update', `/creditors/${creditorId}/paid`, 'PATCH', {},
        () => {
          setCreditors(prev => prev.map(c => c.id === creditorId ? { ...c, paid: true } : c));
        }
      );
    } catch (error) {
      console.error('Failed to mark creditor paid', error);
      alert(error instanceof Error ? error.message : 'Failed to mark creditor paid');
    }
  }, []);

  const handleRecordDebtorPayment = useCallback(async (debtorId: string, amountPaid: number) => {
    try {
      await requestWithQueue(
        'debtor', 'update', `/debtors/${debtorId}/payments`, 'POST',
        { amountPaid },
        () => {
          setDebtors(prev =>
            prev.map(d =>
              d.id === debtorId
                ? {
                    ...d,
                    amountPaid: (d.amountPaid ?? 0) + amountPaid,
                    status: (d.amountPaid ?? 0) + amountPaid >= d.amount ? 'Paid' : 'Partially Paid',
                  }
                : d
            )
          );
        }
      );
    } catch (error) {
      console.error('Failed to record debtor payment', error);
      alert(error instanceof Error ? error.message : 'Failed to record debtor payment');
    }
  }, []);

  const handleAddExpense = useCallback(async (expense: ExpenseRecord) => {
    try {
      await requestWithQueue<ExpenseRecord>(
        'expense', 'create', '/expenses', 'POST',
        expense as unknown as Record<string, unknown>,
        (created) => setExpenses(prev => [created as ExpenseRecord, ...prev])
      );
    } catch (error) {
      console.error('Failed to add expense', error);
      alert(error instanceof Error ? error.message : 'Failed to add expense');
    }
  }, []);

  return (
    <DataContext.Provider
      value={{
        christians, deposits, creditors, debtors, expenses, deathRecords,
        setChristians, setDeposits, setCreditors, setDebtors, setExpenses, setDeathRecords,
        loadData,
        handleAddChristian, handleDeleteChristian, handleRecordPayment,
        handleTransferChristian, handleUpdateSacraments, handleRecordDeath,
        handleAddDeposit, handleAddCreditor, handleMarkCreditorPaid,
        handleRecordDebtorPayment, handleAddExpense,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

/** Convenience hook for consuming components. */
export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
