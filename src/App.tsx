// =============================================================================
// Ecclesia CMS — Application Shell (Root Component)
// =============================================================================
//
// PURPOSE
//   Single stateful root that orchestrates the entire SPA lifecycle:
//   1. Authentication gate (JWT restore → AuthView until valid session)
//   2. Global navigation state (active panel + sub-tabs for 4 compound panels)
//   3. Shared data cache (Christians, finances, deaths — fetched once at login)
//   4. Cross-panel handoffs (selectedMember pre-fills sacrament/activity forms)
//   5. Mutation handlers that push to backend AND patch local state optimistically
//
// ARCHITECTURE: STATE OWNERSHIP
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ App.tsx (this file)                                                     │
//   │   ├── currentTab: NavigationTab                    // Top-level panel   │
//   │   ├── christianSubTab: ChristianSubTab              // 'add'|'find'|'del'│
//   │   ├── activitiesSubTab: ActivitiesSubTab            // payment|transfer  │
//   │   ├── sacramentsSubTab: SacramentsSubTab            // card|death        │
//   │   ├── financeSubTab: FinanceSubTab                  // deposit|cred|...  │
//   │   ├── selectedMember: ChristianRecord | null        // Cross-panel ctx  │
//   │   ├── currentUser: AuthUser | null                  // Session + perms  │
//   │   ├── isAuthenticated / isAuthChecking              // Auth flow state  │
//   │   └── DATA CACHES (lifted state, shared across views):                   │
//   │       ├── christians: ChristianRecord[]             // Parish registry  │
//   │       ├── deposits: DepositRecord[]                 // Bank/cash logs   │
//   │       ├── creditors: CreditorRecord[]               // Vendor payables  │
//   │       ├── debtors: DebtorRecord[]                   // Member receivables│
//   │       ├── expenses: ExpenseRecord[]                 // Operating costs  │
//   │       └── deathRecords: DeathRecord[]               // Mortality log    │
//   └─────────────────────────────────────────────────────────────────────────┘
//
//   Panels WITHOUT lifted state (self-contained data fetch):
//   - LedgersView, InventoryView, ReportsView, HRView, AdminView
//   These manage their own loading/error/empty states internally.
//
// AUTHENTICATION FLOW
//   1. Mount → useEffect(restoreSession) reads 'ecclesia_token' from
//      localStorage (Remember Me) or sessionStorage (session-only).
//   2. If token exists → GET /api/auth/me → validates JWT, returns user + perms
//   3. On success → setCurrentUser, setIsAuthenticated, loadDashboardData()
//   4. If invalid/expired → clear token, show AuthView
//   5. AuthView.onSuccessAuth → handleAuthSuccess() repeats step 2-3
//
// DEEP LINKING (hash-based routing)
//   - URL format: #tab           → e.g. #finance
//               #tab/subtab      → e.g. #christian/find
//   - Registered once in useEffect([]) via 'hashchange' listener
//   - handleNavigate() updates state; programmatic hash changes are IGNORED
//     (navigation should go through Sidebar/Header buttons)
//
// PERMISSIONS MODEL
//   - currentUser.permissions = { panels: Record<PanelKey, boolean>,
//                                 actions: {view,edit,delete} }
//   - canAccessTab() gates top-level panel visibility (Sidebar, Dashboard grid)
//   - PermissionsProvider wraps authenticated shell; usePermissions() hook
//     provides canView/canEdit/canDelete per panel for fine-grained UI hiding
//
// CROSS-PANEL HANDOFFS (selectedMember pattern)
//   - ChristianView "Select for Sacrament" → handleSelectMemberForSacrament()
//     sets selectedMember + navigates to #sacraments/update_card
//   - ChristianView "Select for Payment" → handleSelectMemberForPayment()
//     sets selectedMember + navigates to #activities/receive_payment
//   - SacramentsView & ActivitiesView read selectedMember prop to pre-fill forms
//
// OPTIMISTIC UI UPDATES
//   All mutation handlers (handleAddChristian, handleRecordPayment, etc.)
//   follow the same pattern:
//     1. Call backend API (await christiansApi.create(...))
//     2. On success: patch local state array (setChristians([created, ...]))
//     3. On failure: console.error + alert(user-facing message)
//   This avoids refetching and keeps UX snappy.
//
// RELATED FILES
//   - src/types.ts                    → All NavigationTab, SubTab, Record types
//   - src/services/api.ts             → Typed API client (christiansApi, etc.)
//   - src/permissions.tsx             → PermissionsProvider, usePermissions()
//   - src/components/views/*.tsx      → Individual panel implementations
//   - src/components/Sidebar.tsx      → Navigation drawer (reads allowedPanels)
//   - src/components/Header.tsx       → Top bar, user menu, search trigger
//   - src/components/GlobalSearchModal.tsx → Ctrl+K member lookup
// =============================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivitiesSubTab,
  AuthUser,
  ChristianRecord,
  ChristianSubTab,
  ContributionRecord,
  CreditorRecord,
  DeathRecord,
  DebtorRecord,
  DepositRecord,
  ExpenseRecord,
  FinanceSubTab,
  NavigationTab,
  PanelKey,
  SacramentsSubTab
} from './types';

import { Footer, GlobalSearchModal, Header, Sidebar } from './components';
import {
  ActivitiesView,
  AdminView,
  AuthView,
  ChristianView,
  DashboardView,
  FinanceView,
  HRView,
  InventoryView,
  LedgersView,
  ReportsView,
  SacramentsView
} from './components/views';
import {
  authApi,
  christiansApi,
  clearStoredToken,
  creditorsApi,
  deathsApi,
  debtorsApi,
  depositsApi,
  expensesApi,
  getStoredToken,
  requestWithQueue,
  cacheApiResponse,
  getCachedResponse
} from './services/api';
import { PermissionsProvider } from './permissions';
import { getPendingCount } from './lib/db';

/**
 * Main Application Component for Ecclesia Church Management System.
 * Coordinates global application state, primary navigation tabs, cross-view member selections,
 * and data mutations for members, finances, ledgers, and sacramental records.
 */
export const App: React.FC = () => {
  // Navigation & View active tab states
  /** The currently active top-level navigation panel (dashboard, christian, finance, etc.). */
  const [currentTab, setCurrentTab] = useState<NavigationTab>('auth');
  /** The active sub-tab within the Christian panel: 'add' | 'find' | 'delete'. */
  const [christianSubTab, setChristianSubTab] = useState<ChristianSubTab>('add');
  /** The active sub-tab within the Activities panel: 'receive_payment' | 'transfer' | 'billed_items'. */
  const [activitiesSubTab, setActivitiesSubTab] = useState<ActivitiesSubTab>('receive_payment');
  /** The active sub-tab within the Sacraments panel: 'update_card' | 'record_death'. */
  const [sacramentsSubTab, setSacramentsSubTab] = useState<SacramentsSubTab>('update_card');
  /** The active sub-tab within the Finance panel: 'make_deposit' | 'creditors' | 'debtors' | 'expenses'. */
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>('make_deposit');

  // UI Drawer and Modal dialog visibility flags
  /** Whether the sidebar navigation drawer is currently visible (always true on desktop, toggled on mobile). */
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  /** Whether the global Ctrl+K search modal is open. */
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Live data repositories loaded from the backend API
  /** Master list of all parishioner records fetched from the backend (parish registry). */
  const [christians, setChristians] = useState<ChristianRecord[]>([]);
  /** List of outstanding creditor (vendor payable) records fetched from the backend. */
  const [creditors, setCreditors] = useState<CreditorRecord[]>([]);
  /** List of outstanding debtor (member receivable) records fetched from the backend. */
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  /** List of bank/cash deposit records fetched from the backend (treasury logs). */
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  /** List of operating expense records fetched from the backend. */
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  /** List of death records fetched from the backend (mortality log). */
  const [deathRecords, setDeathRecords] = useState<DeathRecord[]>([]);
  /** Whether the user is currently authenticated (has a valid session). */
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  /** Whether the app is still verifying the existing session on mount (shows loading screen). */
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Currently signed-in user (with per-user panel/action permissions)
  /** The currently authenticated user object including role and permissions, or null if unauthenticated. */
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Selected parishioner context passed across multi-step action views
  /** The parishioner selected for cross-panel handoff, or null. */
  const [selectedMember, setSelectedMember] = useState<ChristianRecord | null>(null);

  // Warn user before closing tab with unsynced changes
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

  /**
   * Fetches all dashboard data from the backend in parallel and populates local state caches.
   * Also caches data to IndexedDB for offline use.
   * Called after successful authentication to seed the shared data layer.
   * @returns {Promise<void>} Resolves when all API calls complete.
   */
  const loadDashboardData = async () => {
    try {
      const [christiansRes, depositsRes, creditorsRes, debtorsRes, expensesRes, deathsRes] = await Promise.all([
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

      // Cache data to IndexedDB for offline fallback
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
      // Try loading from cache if network fails
      try {
        const [cachedChristians, cachedDeposits, cachedCreditors, cachedDebtors, cachedExpenses, cachedDeaths] =
          await Promise.all([
            getCachedResponse<ChristianRecord[]>('christians'),
            getCachedResponse<DepositRecord[]>('deposits'),
            getCachedResponse<CreditorRecord[]>('creditors'),
            getCachedResponse<DebtorRecord[]>('debtors'),
            getCachedResponse<ExpenseRecord[]>('expenses'),
            getCachedResponse<DeathRecord[]>('deaths'),
          ]);
        if (cachedChristians) setChristians(cachedChristians);
        if (cachedDeposits) setDeposits(cachedDeposits);
        if (cachedCreditors) setCreditors(cachedCreditors);
        if (cachedDebtors) setDebtors(cachedDebtors);
        if (cachedExpenses) setExpenses(cachedExpenses);
        if (cachedDeaths) setDeathRecords(cachedDeaths);
      } catch {
        // Cache read also failed — user sees empty state
      }
    }
  };

  /** Resolves the current user + seeds the shared data cache after login. */
  const handleAuthSuccess = async () => {
    try {
      const me = await authApi.me();
      setCurrentUser(me);
    } catch {
      setCurrentUser(null);
    }
    setIsAuthenticated(true);
    setCurrentTab('dashboard');
    await loadDashboardData();
  };

  useEffect(() => {
    const restoreSession = async () => {
      const token = getStoredToken();
      if (!token) {
        setIsAuthenticated(false);
        setCurrentTab('auth');
        setIsAuthChecking(false);
        return;
      }

      try {
        const me = await authApi.me();
        setCurrentUser(me);
        setIsAuthenticated(true);
        setCurrentTab('dashboard');
        await loadDashboardData();
      } catch {
        clearStoredToken();
        setIsAuthenticated(false);
        setCurrentTab('auth');
      } finally {
        setIsAuthChecking(false);
      }
    };

    void restoreSession();
  }, []);

  // Deep-link support: #tab or #tab/subtab, e.g. #finance or #christian/find.
  // NOTE: the listener is registered once on mount, so applyHash closes over the
  // first render's handleNavigate. Programmatic hash changes (setting
  // window.location.hash) are effectively ignored — navigation should go through
  // the sidebar/header buttons instead.
  useEffect(() => {
    const applyHash = () => {
      const parts = window.location.hash.replace(/^#/, '').split('/');
      const tab = parts[0] as NavigationTab;
      const tabs: NavigationTab[] = [
        'dashboard',
        'christian',
        'activities',
        'sacraments',
        'finance',
        'ledgers',
        'inventory',
        'reports',
        'hr',
        'administration',
        'auth'
      ];
      if (tabs.includes(tab)) {
        handleNavigate(tab, parts[1]);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switches the active top-level navigation view and optionally sets the active sub-tab.
   * @param {NavigationTab} tab - The top-level panel to activate.
   * @param {string} [subTab] - Optional sub-tab identifier for compound panels (christian, activities, sacraments, finance).
   */
  const handleNavigate = (tab: NavigationTab, subTab?: string) => {
    if (tab === 'auth') {
      clearStoredToken();
      setCurrentUser(null);
      setIsAuthenticated(false);
      setCurrentTab('auth');
      return;
    }
    if (tab !== 'dashboard' && !canAccessTab(tab)) return;
    setCurrentTab(tab);
    if (subTab) {
      if (tab === 'christian') setChristianSubTab(subTab as ChristianSubTab);
      if (tab === 'activities') setActivitiesSubTab(subTab as ActivitiesSubTab);
      if (tab === 'sacraments') setSacramentsSubTab(subTab as SacramentsSubTab);
      if (tab === 'finance') setFinanceSubTab(subTab as FinanceSubTab);
    }
  };

  /**
   * Whether the signed-in user may open the given management panel.
   * Dashboard and Auth are always reachable; everything else maps to a panel permission.
   * @param {NavigationTab} tab - The navigation tab to check access for.
   * @returns {boolean} True if the user has access to the panel.
   */
  const canAccessTab = (tab: NavigationTab): boolean => {
    if (tab === 'dashboard' || tab === 'auth') return true;
    if (!currentUser) return false;
    const key = tab as PanelKey;
    return currentUser.permissions.panels[key] !== false;
  };

  // Panels the current user is allowed to see (used to filter the sidebar + dashboard grid)
  /** Array of PanelKey values representing panels the current user has permission to access. */
  const allowedPanels: PanelKey[] = (Object.keys(currentUser?.permissions.panels ?? {}) as PanelKey[]).filter(
    (k) => currentUser?.permissions.panels[k]
  );

  /**
   * Adds a newly registered parishioner to the central register.
   * Uses offline queue when backend is unavailable.
   * @param {ChristianRecord} newMember - The new parishioner record to create.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleAddChristian = async (newMember: ChristianRecord) => {
    try {
      await requestWithQueue<ChristianRecord>(
        'christian', 'create', '/christians', 'POST',
        newMember as unknown as Record<string, unknown>,
        (created) => setChristians([created as ChristianRecord, ...christians])
      );
    } catch (error) {
      console.error('Failed to add christian', error);
      alert(error instanceof Error ? error.message : 'Failed to add christian record');
    }
  };

  /**
   * Soft-deletes a Christian record (hidden from lists, restorable from Trash & Audit).
   * Uses offline queue when backend is unavailable.
   * @param {string} id - The unique ID of the parishioner to delete.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleDeleteChristian = async (id: string) => {
    try {
      await requestWithQueue(
        'christian', 'delete', `/christians/${id}`, 'DELETE', {},
        () => setChristians(christians.filter((c) => c.id !== id))
      );
    } catch (error) {
      console.error('Failed to delete christian', error);
      alert(error instanceof Error ? error.message : 'Failed to delete christian record');
    }
  };

  /**
   * Pre-selects a member and opens the Sacraments update workflow.
   * Sets the selectedMember state and navigates to the sacraments/update_card sub-tab.
   * @param {ChristianRecord} member - The parishioner to pre-select for sacrament operations.
   */
  const handleSelectMemberForSacrament = (member: ChristianRecord) => {
    setSelectedMember(member);
    setCurrentTab('sacraments');
    setSacramentsSubTab('update_card');
  };

  /**
   * Pre-selects a member and redirects to the Activities / Contribution receipt workflow.
   * Sets the selectedMember state and navigates to the activities/receive_payment sub-tab.
   * @param {ChristianRecord} member - The parishioner to pre-select for payment operations.
   */
  const handleSelectMemberForPayment = (member: ChristianRecord) => {
    setSelectedMember(member);
    setCurrentTab('activities');
    setActivitiesSubTab('receive_payment');
  };

  /**
   * Handles contribution payment logging.
   * Uses offline queue when backend is unavailable.
   * @param {ContributionRecord} payment - The contribution payment record to create.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleRecordPayment = async (payment: ContributionRecord) => {
    try {
      await requestWithQueue<ContributionRecord>(
        'contribution', 'create', '/contributions', 'POST',
        payment as unknown as Record<string, unknown>
      );
    } catch (error) {
      console.error('Failed to record payment', error);
      alert(error instanceof Error ? error.message : 'Failed to record payment');
    }
  };

  /**
   * Updates parishioner status and destination hierarchy on parish transfer.
   * Uses offline queue when backend is unavailable.
   * @param {string} memberId - The unique ID of the parishioner to transfer.
   * @param {object} dest - The destination parish hierarchy.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleTransferChristian = async (
    memberId: string,
    dest: { diocese: string; parish: string; localChurch: string; scc: string }
  ) => {
    const member = christians.find((c) => c.id === memberId);
    if (!member) return;
    try {
      await requestWithQueue(
        'transfer', 'create', '/transfers', 'POST',
        {
          christianId: memberId,
          memberName: `${member.baptismalName} ${member.sirName}`,
          diocese: dest.diocese,
          parish: dest.parish,
          localChurch: dest.localChurch,
          scc: dest.scc,
          date: new Date().toISOString().split('T')[0],
        },
        () => {
          setChristians(
            christians.map((c) =>
              c.id === memberId
                ? {
                    ...c,
                    status: 'Transferred',
                    diocese: dest.diocese,
                    parish: dest.parish,
                    localChurch: dest.localChurch,
                    scc: dest.scc,
                  }
                : c
            )
          );
        }
      );
    } catch (error) {
      console.error('Failed to record transfer', error);
      alert(error instanceof Error ? error.message : 'Failed to record transfer');
    }
  };

  /**
   * Updates sacramental fields for a member.
   * Uses offline queue when backend is unavailable.
   * @param {string} memberId - The unique ID of the parishioner to update.
   * @param {Partial<ChristianRecord>} data - Partial record containing sacrament fields to update.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleUpdateSacraments = async (memberId: string, data: Partial<ChristianRecord>) => {
    try {
      await requestWithQueue(
        'christian', 'update', `/christians/${memberId}/sacraments`, 'PATCH',
        data as unknown as Record<string, unknown>,
        () => setChristians(christians.map((c) => (c.id === memberId ? { ...c, ...data } : c)))
      );
    } catch (error) {
      console.error('Failed to update sacraments', error);
      alert(error instanceof Error ? error.message : 'Failed to update sacraments');
    }
  };

  /**
   * Records parishioner death entry and updates member status to Deceased.
   * Uses offline queue when backend is unavailable.
   * @param {DeathRecord} death - The death record to create.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleRecordDeath = async (death: DeathRecord) => {
    try {
      await requestWithQueue<DeathRecord>(
        'death', 'create', '/deaths', 'POST',
        death as unknown as Record<string, unknown>,
        (created) => {
          setDeathRecords([created as DeathRecord, ...deathRecords]);
          setChristians(
            christians.map((c) => (c.id === death.christianId ? { ...c, status: 'Deceased' } : c))
          );
        }
      );
    } catch (error) {
      console.error('Failed to record death', error);
      alert(error instanceof Error ? error.message : 'Failed to record death');
    }
  };

  /**
   * Adds bank/cash deposit record to treasury logs.
   * Uses offline queue when backend is unavailable.
   * @param {DepositRecord} deposit - The deposit record to create.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleAddDeposit = async (deposit: DepositRecord) => {
    try {
      await requestWithQueue<DepositRecord>(
        'deposit', 'create', '/deposits', 'POST',
        deposit as unknown as Record<string, unknown>,
        (created) => setDeposits([created as DepositRecord, ...deposits])
      );
    } catch (error) {
      console.error('Failed to add deposit', error);
      alert(error instanceof Error ? error.message : 'Failed to add deposit');
    }
  };

  /**
   * Adds a new parish creditor obligation.
   * Uses offline queue when backend is unavailable.
   * @param {CreditorRecord} creditor - The creditor record to create.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleAddCreditor = async (creditor: CreditorRecord) => {
    try {
      await requestWithQueue<CreditorRecord>(
        'creditor', 'create', '/creditors', 'POST',
        creditor as unknown as Record<string, unknown>,
        (created) => setCreditors([created as CreditorRecord, ...creditors])
      );
    } catch (error) {
      console.error('Failed to add creditor', error);
      alert(error instanceof Error ? error.message : 'Failed to add creditor');
    }
  };

  /**
   * Settles an outstanding creditor record.
   * Uses offline queue when backend is unavailable.
   * @param {string} creditorId - The unique ID of the creditor to mark as paid.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleMarkCreditorPaid = async (creditorId: string) => {
    try {
      await requestWithQueue(
        'creditor', 'update', `/creditors/${creditorId}/paid`, 'PATCH', {},
        () => {
          setCreditors(creditors.map((c) => (c.id === creditorId ? { ...c, paid: true } : c)));
        }
      );
    } catch (error) {
      console.error('Failed to mark creditor paid', error);
      alert(error instanceof Error ? error.message : 'Failed to mark creditor paid');
    }
  };

  /**
   * Applies partial or full payment against a debtor balance.
   * Uses offline queue when backend is unavailable.
   * @param {string} debtorId - The unique ID of the debtor to apply payment to.
   * @param {number} amountPaid - The payment amount to apply.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleRecordDebtorPayment = async (debtorId: string, amountPaid: number) => {
    try {
      await requestWithQueue(
        'debtor', 'update', `/debtors/${debtorId}/payments`, 'POST',
        { amountPaid },
        () => {
          setDebtors(
            debtors.map((d) =>
              d.id === debtorId
                ? { ...d, amountPaid: (d.amountPaid ?? 0) + amountPaid, status: (d.amountPaid ?? 0) + amountPaid >= d.amount ? 'Paid' : 'Partially Paid' }
                : d
            )
          );
        }
      );
    } catch (error) {
      console.error('Failed to record debtor payment', error);
      alert(error instanceof Error ? error.message : 'Failed to record debtor payment');
    }
  };

  /**
   * Records a new operating expense entry.
   * Uses offline queue when backend is unavailable.
   * @param {ExpenseRecord} expense - The expense record to create.
   * @returns {Promise<void>} Resolves when the API call completes.
   */
  const handleAddExpense = async (expense: ExpenseRecord) => {
    try {
      await requestWithQueue<ExpenseRecord>(
        'expense', 'create', '/expenses', 'POST',
        expense as unknown as Record<string, unknown>,
        (created) => setExpenses([created as ExpenseRecord, ...expenses])
      );
    } catch (error) {
      console.error('Failed to add expense', error);
      alert(error instanceof Error ? error.message : 'Failed to add expense');
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9f9]">
        <p className="text-xs text-[#444748] animate-pulse">Loading Ecclesia CMS...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView onSuccessAuth={() => void handleAuthSuccess()} />;
  }

  return (
    <PermissionsProvider
      permissions={
        currentUser?.permissions ?? {
          panels: {
            christian: true,
            activities: true,
            sacraments: true,
            finance: true,
            ledgers: true,
            inventory: true,
            reports: true,
            hr: true,
            administration: true
          },
          actions: { view: true, edit: true, delete: true }
        }
      }
    >
    <div className="min-h-screen flex flex-col bg-[#f9f9f9] text-[#1a1c1c] font-serif selection:bg-[#1e1e1e] selection:text-white">
      {/* Top Header */}
      <Header
        onSelectTab={(tab) => handleNavigate(tab)}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenSearch={() => setIsSearchOpen(true)}
        user={currentUser}
      />

      {/* Main Body Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Drawer Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => handleNavigate(tab)}
          isOpen={isSidebarOpen}
          onCloseMobile={() => setIsSidebarOpen(false)}
          allowedPanels={allowedPanels}
        />

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigate}
              memberCount={christians.filter((c) => c.status === 'Active').length}
              allowedPanels={allowedPanels}
            />
          )}

          {currentTab === 'christian' && (
            <ChristianView
              christians={christians}
              onAddChristian={handleAddChristian}
              onDeleteChristian={handleDeleteChristian}
              onSelectMemberForSacrament={handleSelectMemberForSacrament}
              onSelectMemberForPayment={handleSelectMemberForPayment}
              initialSubTab={christianSubTab}
            />
          )}

          {currentTab === 'activities' && (
            <ActivitiesView
              christians={christians}
              selectedMember={selectedMember}
              initialSubTab={activitiesSubTab}
              onRecordPayment={handleRecordPayment}
              onTransferChristian={handleTransferChristian}
            />
          )}

          {currentTab === 'sacraments' && (
            <SacramentsView
              christians={christians}
              selectedMember={selectedMember}
              deathRecords={deathRecords}
              initialSubTab={sacramentsSubTab}
              onUpdateSacraments={handleUpdateSacraments}
              onRecordDeath={handleRecordDeath}
            />
          )}

          {currentTab === 'finance' && (
            <FinanceView
              deposits={deposits}
              creditors={creditors}
              debtors={debtors}
              expenses={expenses}
              initialSubTab={financeSubTab}
              onAddDeposit={handleAddDeposit}
              onAddCreditor={handleAddCreditor}
              onMarkCreditorPaid={handleMarkCreditorPaid}
              onRecordDebtorPayment={handleRecordDebtorPayment}
              onAddExpense={handleAddExpense}
            />
          )}

          {currentTab === 'ledgers' && <LedgersView />}
          {currentTab === 'inventory' && <InventoryView />}
          {currentTab === 'reports' && <ReportsView />}
          {currentTab === 'hr' && <HRView />}
          {currentTab === 'administration' && <AdminView currentUserId={currentUser?.id ?? null} />}

          <Footer />
        </main>
      </div>

      {/* Global Search Ctrl+K Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        christians={christians}
        onSelectMember={(member) => {
          setSelectedMember(member);
          setCurrentTab('christian');
          setChristianSubTab('find');
        }}
        onNavigate={handleNavigate}
      />
    </div>
    </PermissionsProvider>
  );
};

export default App;
