import React, { useState, useEffect } from 'react';
import {
  NavigationTab,
  ChristianSubTab,
  ActivitiesSubTab,
  SacramentsSubTab,
  FinanceSubTab,
  ChristianRecord,
  ContributionRecord,
  DeathRecord,
  DepositRecord,
  CreditorRecord,
  DebtorRecord,
  ExpenseRecord
} from './types';

import {
  INITIAL_CHRISTIANS,
  INITIAL_CREDITORS,
  INITIAL_DEBTORS,
  INITIAL_DEPOSITS,
  INITIAL_EXPENSES,
  INITIAL_DEATHS
} from './data/mockData';

import { Header, Sidebar, Footer, GlobalSearchModal } from './components';
import {
  DashboardView,
  ChristianView,
  ActivitiesView,
  SacramentsView,
  FinanceView,
  LedgersView,
  InventoryView,
  ReportsView,
  HRView,
  AdminView,
  AuthView
} from './components/views';

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

  // In-memory Data Repositories (initialized with parish mock datasets)
  const [christians, setChristians] = useState<ChristianRecord[]>(INITIAL_CHRISTIANS);
  const [creditors, setCreditors] = useState<CreditorRecord[]>(INITIAL_CREDITORS);
  const [debtors, setDebtors] = useState<DebtorRecord[]>(INITIAL_DEBTORS);
  const [deposits, setDeposits] = useState<DepositRecord[]>(INITIAL_DEPOSITS);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(INITIAL_EXPENSES);
  const [deathRecords, setDeathRecords] = useState<DeathRecord[]>(INITIAL_DEATHS);

  // Selected parishioner context passed across multi-step action views (e.g. sacrament update, contribution receipt)
  const [selectedMember, setSelectedMember] = useState<ChristianRecord | null>(null);

  // Deep-link support: #tab or #tab/subtab, e.g. #finance or #christian/find
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
    setCurrentTab(tab);
    if (subTab) {
      if (tab === 'christian') setChristianSubTab(subTab as ChristianSubTab);
      if (tab === 'activities') setActivitiesSubTab(subTab as ActivitiesSubTab);
      if (tab === 'sacraments') setSacramentsSubTab(subTab as SacramentsSubTab);
      if (tab === 'finance') setFinanceSubTab(subTab as FinanceSubTab);
    }
  };

  /** Adds a newly registered parishioner to the central register */
  const handleAddChristian = (newMember: ChristianRecord) => {
    setChristians([newMember, ...christians]);
  };

  /** Marks a Christian record as inactive rather than permanently removing historical data */
  const handleDeleteChristian = (id: string) => {
    setChristians(christians.map((c) => (c.id === id ? { ...c, status: 'Inactive' } : c)));
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

  /** Handles contribution payment logging */
  const handleRecordPayment = (payment: ContributionRecord) => {
    // Handler available for updating financial ledgers or individual contribution tallies
  };

  /** Updates parishioner status and destination hierarchy on parish transfer */
  const handleTransferChristian = (
    memberId: string,
    dest: { diocese: string; parish: string; localChurch: string; scc: string }
  ) => {
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
  };

  /** Updates sacramental fields (Baptism, Confirmation, Holy Matrimony, Eucharist) for a member */
  const handleUpdateSacraments = (memberId: string, data: Partial<ChristianRecord>) => {
    setChristians(christians.map((c) => (c.id === memberId ? { ...c, ...data } : c)));
  };

  /** Records parishioner death entry and updates member status to Deceased */
  const handleRecordDeath = (death: DeathRecord) => {
    setDeathRecords([death, ...deathRecords]);
    setChristians(
      christians.map((c) => (c.id === death.christianId ? { ...c, status: 'Deceased' } : c))
    );
  };

  /** Adds bank/cash deposit record to treasury logs */
  const handleAddDeposit = (deposit: DepositRecord) => {
    setDeposits([deposit, ...deposits]);
  };

  /** Adds a new parish creditor obligation */
  const handleAddCreditor = (creditor: CreditorRecord) => {
    setCreditors([creditor, ...creditors]);
  };

  /** Settles an outstanding creditor record */
  const handleMarkCreditorPaid = (creditorId: string) => {
    setCreditors(
      creditors.map((c) => (c.id === creditorId ? { ...c, status: 'Paid' as const } : c))
    );
  };

  /** Applies partial or full payment against a debtor balance */
  const handleRecordDebtorPayment = (debtorId: string, amountPaid: number) => {
    setDebtors(
      debtors.map((d) => {
        if (d.id === debtorId) {
          const remaining = d.amount - amountPaid;
          return {
            ...d,
            amount: Math.max(0, remaining),
            status: remaining <= 0 ? ('Paid' as const) : ('Partially Paid' as const)
          };
        }
        return d;
      })
    );
  };

  /** Records a new operating expense entry */
  const handleAddExpense = (expense: ExpenseRecord) => {
    setExpenses([expense, ...expenses]);
  };

  if (currentTab === 'auth') {
    return (
      <div className="min-h-screen bg-[#f9f9f9] text-[#1a1c1c] font-serif selection:bg-[#1e1e1e] selection:text-white">
        <AuthView onSuccessAuth={() => setCurrentTab('dashboard')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f9] text-[#1a1c1c] font-serif selection:bg-[#1e1e1e] selection:text-white">
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={(tab) => handleNavigate(tab)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Main Body Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Drawer Sidebar - hidden during authentication flow */}
        {currentTab !== 'auth' && (
          <Sidebar
            currentTab={currentTab}
            onSelectTab={(tab) => handleNavigate(tab)}
            isOpen={isSidebarOpen}
            onCloseMobile={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigate}
              memberCount={christians.filter((c) => c.status === 'Active').length}
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
          {currentTab === 'administration' && <AdminView />}
          {currentTab === 'auth' && (
            <AuthView onSuccessAuth={() => setCurrentTab('dashboard')} />
          )}

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
  );
};

export default App;
