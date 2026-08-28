// =============================================================================
// Ecclesia CMS — DataContext
// =============================================================================
//
// PURPOSE
//   Owns non-Christian shared data arrays (deposits, creditors, debtors,
//   expenses, deaths), the bulk data loader, all optimistic mutation handlers,
//   and the Socket.IO realtime subscriptions that patch local state.
//
//   Christian/parishioner registry state lives in ChristiansContext.tsx.
//   App.tsx reads from context and passes slice references to panel components.
//
// RELATED FILES
//   src/context/ChristiansContext.tsx → Christian registry state + CRUD handlers
//   src/context/AuthContext.tsx       → Registers onDataReady callback to trigger loadData
//   src/hooks/useRealtime.ts         → Socket.IO resource subscriptions
//   src/services/api.ts              → Typed API clients
//   src/App.tsx                      → Consumes DataContext for panels + handlers
// =============================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ContributionRecord,
  CreditorRecord,
  DeathRecord,
  DebtorRecord,
  DepositRecord,
  ExpenseRecord,
} from '../types';
import {
  deathsApi,
  creditorsApi,
  debtorsApi,
  depositsApi,
  expensesApi,
  requestWithQueue,
} from '../services/api';

import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from './AuthContext';

interface DataContextValue {
  // ── Data arrays ───────────────────────────────────────────────────────────
  deposits: DepositRecord[];
  creditors: CreditorRecord[];
  debtors: DebtorRecord[];
  expenses: ExpenseRecord[];
  deathRecords: DeathRecord[];

  // ── Actions ───────────────────────────────────────────────────────────────
  loadData: () => Promise<void>;
  handleRecordPayment: (p: ContributionRecord) => Promise<void>;
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
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [creditors, setCreditors] = useState<CreditorRecord[]>([]);
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [deathRecords, setDeathRecords] = useState<DeathRecord[]>([]);

  // ── Load dashboard data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [depositsRes, creditorsRes, debtorsRes, expensesRes, deathsRes] =
        await Promise.all([
          depositsApi.list(),
          creditorsApi.list(),
          debtorsApi.list(),
          expensesApi.list(),
          deathsApi.list(),
        ]);
      setDeposits(depositsRes);
      setCreditors(creditorsRes);
      setDebtors(debtorsRes);
      setExpenses(expensesRes);
      setDeathRecords(deathsRes);


    } catch (error) {
      console.error('Failed to load church data from the backend', error);
    }
    // Note: Christians are loaded by ChristiansContext independently.
  }, []);

  // Register loadData with AuthContext so it can trigger data loading after auth
  useEffect(() => {
    onDataReady.current = loadData;
    return () => { onDataReady.current = null; };
  }, [loadData, onDataReady]);

  // ── Real-time listeners (Socket.IO) ──────────────────────────────────────
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

  // ── Mutation handlers ─────────────────────────────────────────────────────

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

  // handleRecordDeath lives in ChristiansContext — it posts to /deaths and
  // sets the christian's status to Deceased. The backend emits a 'deaths'
  // data:change event, which the realtime listener above picks up.
  // No separate handler needed here.

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
        deposits, creditors, debtors, expenses, deathRecords,
        loadData,
        handleRecordPayment,
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
