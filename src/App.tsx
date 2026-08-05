// =============================================================================
// Application shell / root component
// -----------------------------------------------------------------------------
// Owns the top-level state machine for the whole SPA:
//   - Auth gate: restoreSession on mount (token in localStorage) -> AuthView
//     until an authenticated user session exists.
//   - Navigation state: the active panel + the active sub-tab of the four
//     panels that track one (christian / activities / sacraments / finance).
//   - Shared data cache: Christians, deposits, creditors, debtors, expenses and
//     death records are fetched once at login and threaded down as props; the
//     mutation handlers below push updates to the backend AND patch local state
//     so every view stays in sync without refetching.
//   - Cross-panel handoffs: selectedMember lets the Christian registry pre-fill
//     the Sacraments / Activities workflows; GlobalSearchModal navigates to a
//     member's card.
//
// Panels without lifted state (Ledgers, Inventory, Reports, HR, Administration)
// manage their own data internally and render <Footer /> beneath the content.
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
  contributionsApi,
  creditorsApi,
  deathsApi,
  debtorsApi,
  depositsApi,
  expensesApi,
  transfersApi
} from './services/api';
import { PermissionsProvider } from './permissions';

/**
 * Main Application Component for Ecclesia Church Management System.
 * Coordinates global application state, primary navigation tabs, cross-view member selections,
 * and data mutations for members, finances, ledgers, and sacramental records.
 */
export const App: React.FC = () => {
  // Navigation & View active tab states
  const [currentTab, setCurrentTab] = useState<NavigationTab>('auth');
  const [christianSubTab, setChristianSubTab] = useState<ChristianSubTab>('add');
  const [activitiesSubTab, setActivitiesSubTab] = useState<ActivitiesSubTab>('receive_payment');
  const [sacramentsSubTab, setSacramentsSubTab] = useState<SacramentsSubTab>('update_card');
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>('make_deposit');

  // UI Drawer and Modal dialog visibility flags
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Live data repositories loaded from the backend API
  const [christians, setChristians] = useState<ChristianRecord[]>([]);
  const [creditors, setCreditors] = useState<CreditorRecord[]>([]);
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [deathRecords, setDeathRecords] = useState<DeathRecord[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Currently signed-in user (with per-user panel/action permissions)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Selected parishioner context passed across multi-step action views (e.g. sacrament update, contribution receipt)
  const [selectedMember, setSelectedMember] = useState<ChristianRecord | null>(null);

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
    } catch (error) {
      console.error('Failed to load church data from the backend', error);
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
      const token = localStorage.getItem('ecclesia_token');
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
        localStorage.removeItem('ecclesia_token');
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
   */
  const handleNavigate = (tab: NavigationTab, subTab?: string) => {
    if (tab === 'auth') {
      localStorage.removeItem('ecclesia_token');
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
   */
  const canAccessTab = (tab: NavigationTab): boolean => {
    if (tab === 'dashboard' || tab === 'auth') return true;
    if (!currentUser) return false;
    const key = tab as PanelKey;
    return currentUser.permissions.panels[key] !== false;
  };

  // Panels the current user is allowed to see (used to filter the sidebar + dashboard grid)
  const allowedPanels: PanelKey[] = (Object.keys(currentUser?.permissions.panels ?? {}) as PanelKey[]).filter(
    (k) => currentUser?.permissions.panels[k]
  );

  /** Adds a newly registered parishioner to the central register (persists to the backend). */
  const handleAddChristian = async (newMember: ChristianRecord) => {
    try {
      const created = await christiansApi.create(newMember);
      setChristians([created, ...christians]);
    } catch (error) {
      console.error('Failed to add christian', error);
      alert(error instanceof Error ? error.message : 'Failed to add christian record');
    }
  };

  /** Soft-deletes a Christian record (hidden from lists, restorable from Trash & Audit) */
  const handleDeleteChristian = async (id: string) => {
    try {
      await christiansApi.remove(id);
      setChristians(christians.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Failed to delete christian', error);
      alert(error instanceof Error ? error.message : 'Failed to delete christian record');
    }
  };

  /** Pre-selects a member and opens the Sacraments update workflow */
  const handleSelectMemberForSacrament = (member: ChristianRecord) => {
    setSelectedMember(member);
    setCurrentTab('sacraments');
    setSacramentsSubTab('update_card');
  };

  /** Pre-selects a member and redirects to the Activities / Contribution receipt workflow */
  const handleSelectMemberForPayment = (member: ChristianRecord) => {
    setSelectedMember(member);
    setCurrentTab('activities');
    setActivitiesSubTab('receive_payment');
  };

  /** Handles contribution payment logging (persists to the backend) */
  const handleRecordPayment = async (payment: ContributionRecord) => {
    try {
      await contributionsApi.create(payment);
    } catch (error) {
      console.error('Failed to record payment', error);
      alert(error instanceof Error ? error.message : 'Failed to record payment');
    }
  };

  /** Updates parishioner status and destination hierarchy on parish transfer */
  const handleTransferChristian = async (
    memberId: string,
    dest: { diocese: string; parish: string; localChurch: string; scc: string }
  ) => {
    const member = christians.find((c) => c.id === memberId);
    if (!member) return;
    try {
      await transfersApi.create({
        christianId: memberId,
        memberName: `${member.baptismalName} ${member.sirName}`,
        diocese: dest.diocese,
        parish: dest.parish,
        localChurch: dest.localChurch,
        scc: dest.scc,
        date: new Date().toISOString().split('T')[0]
      });
      setChristians(
        christians.map((c) =>
          c.id === memberId
            ? {
                ...c,
                status: 'Transferred',
                diocese: dest.diocese,
                parish: dest.parish,
                localChurch: dest.localChurch,
                scc: dest.scc
              }
            : c
        )
      );
    } catch (error) {
      console.error('Failed to record transfer', error);
      alert(error instanceof Error ? error.message : 'Failed to record transfer');
    }
  };

  /** Updates sacramental fields (Baptism, Confirmation, Holy Matrimony, Eucharist) for a member */
  const handleUpdateSacraments = async (memberId: string, data: Partial<ChristianRecord>) => {
    try {
      await christiansApi.updateSacraments(memberId, data);
      setChristians(christians.map((c) => (c.id === memberId ? { ...c, ...data } : c)));
    } catch (error) {
      console.error('Failed to update sacraments', error);
      alert(error instanceof Error ? error.message : 'Failed to update sacraments');
    }
  };

  /** Records parishioner death entry and updates member status to Deceased */
  const handleRecordDeath = async (death: DeathRecord) => {
    try {
      const created = await deathsApi.create(death);
      setDeathRecords([created, ...deathRecords]);
      setChristians(
        christians.map((c) => (c.id === death.christianId ? { ...c, status: 'Deceased' } : c))
      );
    } catch (error) {
      console.error('Failed to record death', error);
      alert(error instanceof Error ? error.message : 'Failed to record death');
    }
  };

  /** Adds bank/cash deposit record to treasury logs */
  const handleAddDeposit = async (deposit: DepositRecord) => {
    try {
      const created = await depositsApi.create(deposit);
      setDeposits([created, ...deposits]);
    } catch (error) {
      console.error('Failed to add deposit', error);
      alert(error instanceof Error ? error.message : 'Failed to add deposit');
    }
  };

  /** Adds a new parish creditor obligation */
  const handleAddCreditor = async (creditor: CreditorRecord) => {
    try {
      const created = await creditorsApi.create(creditor);
      setCreditors([created, ...creditors]);
    } catch (error) {
      console.error('Failed to add creditor', error);
      alert(error instanceof Error ? error.message : 'Failed to add creditor');
    }
  };

  /** Settles an outstanding creditor record */
  const handleMarkCreditorPaid = async (creditorId: string) => {
    try {
      const updated = await creditorsApi.markPaid(creditorId);
      setCreditors(creditors.map((c) => (c.id === creditorId ? updated : c)));
    } catch (error) {
      console.error('Failed to mark creditor paid', error);
      alert(error instanceof Error ? error.message : 'Failed to mark creditor paid');
    }
  };

  /** Applies partial or full payment against a debtor balance */
  const handleRecordDebtorPayment = async (debtorId: string, amountPaid: number) => {
    try {
      const updated = await debtorsApi.recordPayment(debtorId, amountPaid);
      setDebtors(debtors.map((d) => (d.id === debtorId ? updated : d)));
    } catch (error) {
      console.error('Failed to record debtor payment', error);
      alert(error instanceof Error ? error.message : 'Failed to record debtor payment');
    }
  };

  /** Records a new operating expense entry */
  const handleAddExpense = async (expense: ExpenseRecord) => {
    try {
      const created = await expensesApi.create(expense);
      setExpenses([created, ...expenses]);
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
        currentTab={currentTab}
        onSelectTab={(tab) => handleNavigate(tab)}
        isSidebarOpen={isSidebarOpen}
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
