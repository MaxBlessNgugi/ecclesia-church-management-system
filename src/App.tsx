// =============================================================================
// Ecclesia CMS — Application Shell (Thin Orchestrator)
// =============================================================================
//
// PURPOSE
//   Minimal root component that:
//   1. Composes context providers (ConnectivityProvider + SocketProvider are in main.tsx)
//   2. Handles auth gates (loading → auth → setup → password change → app)
//   3. Renders the layout chrome (TitleBar, Header, Sidebar, Footer)
//   4. Delegates panel content to view components
//
// ALL STATE AND HANDLERS live in dedicated contexts:
//   - src/context/AuthContext.tsx        → session, login/logout, mustChangePassword
//   - src/context/DataContext.tsx        → data arrays, mutations, realtime
//   - src/context/NavigationContext.tsx  → tabs, sub-tabs, selectedMember
//   - src/permissions.tsx               → panel/action permissions
//
// RELATED FILES
//   src/main.tsx                  → Mounts ConnectivityProvider + SocketProvider
//   src/context/*.tsx             → All context providers
//   src/components/views/*.tsx    → Panel implementations
// =============================================================================
import React, { Suspense, useEffect } from 'react';
import { Footer, GlobalSearchModal, Header, Sidebar, TitleBar } from './components';
import { ServerConnection } from './components/ServerConnection';


// Lazy-load view components to split the bundle — each view is only loaded when its tab is active
const DashboardView = React.lazy(() => import('./components/views/DashboardView').then(m => ({ default: m.DashboardView })));
const ChristianView = React.lazy(() => import('./components/views/ChristianView').then(m => ({ default: m.ChristianView })));
const ActivitiesView = React.lazy(() => import('./components/views/ActivitiesView').then(m => ({ default: m.ActivitiesView })));
const SacramentsView = React.lazy(() => import('./components/views/SacramentsView').then(m => ({ default: m.SacramentsView })));
const FinanceView = React.lazy(() => import('./components/views/FinanceView').then(m => ({ default: m.FinanceView })));
const LedgersView = React.lazy(() => import('./components/views/LedgersView').then(m => ({ default: m.LedgersView })));
const InventoryView = React.lazy(() => import('./components/views/InventoryView').then(m => ({ default: m.InventoryView })));
const ReportsView = React.lazy(() => import('./components/views/ReportsView').then(m => ({ default: m.ReportsView })));
const HRView = React.lazy(() => import('./components/views/HRView').then(m => ({ default: m.HRView })));
const AdminView = React.lazy(() => import('./components/views/AdminView').then(m => ({ default: m.AdminView })));
const AuthView = React.lazy(() => import('./components/views/AuthView').then(m => ({ default: m.AuthView })));
const SetupView = React.lazy(() => import('./components/views/SetupView').then(m => ({ default: m.SetupView })));
import { getServerUrl } from './services/api';
import { parseHashRoute } from './utils/url';
import { ChristianRecord, NavigationTab } from './types';
import { PermissionsProvider } from './permissions';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChristiansProvider, useChristians } from './context/ChristiansContext';
import { DataProvider, useData } from './context/DataContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

// ── Inner app (requires all providers to be mounted) ──────────────────────
const AppShell: React.FC = () => {
  const {
    currentUser, isAuthenticated, isAuthChecking, mustChangePassword, needsSetup,
    handleAuthSuccess, handlePasswordChangeComplete, handleSetupComplete,
  } = useAuth();
  const {
    christians,
    handleAddChristian, handleDeleteChristian,
    handleTransferChristian, handleUpdateSacraments, handleRecordDeath,
  } = useChristians();
  const {
    deposits, creditors, debtors, expenses, deathRecords,
    handleRecordPayment,
    handleAddDeposit, handleAddCreditor, handleMarkCreditorPaid,
    handleRecordDebtorPayment, handleAddExpense,
    handleDeleteDeposit, handleDeleteCreditor, handleDeleteDebtor, handleDeleteExpense,
  } = useData();
  const {
    currentTab, christianSubTab, activitiesSubTab, sacramentsSubTab, financeSubTab,
    isSidebarOpen, isSearchOpen, selectedMember, allowedPanels,
    handleNavigate, setIsSidebarOpen, setIsSearchOpen, setSelectedMember,
  } = useNavigation();

  // ── Deep-link support: #tab or #tab/subtab ──────────────────────────────
  useEffect(() => {
    const applyHash = () => {
      const { tab, subTab } = parseHashRoute(window.location.hash);
      const tabs: NavigationTab[] = [
        'dashboard', 'christian', 'activities', 'sacraments', 'finance',
        'ledgers', 'inventory', 'reports', 'hr', 'administration', 'auth',
      ];
      if (tabs.includes(tab as NavigationTab)) {
        handleNavigate(tab as NavigationTab, subTab);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gate: loading ────────────────────────────────────────────────────────
  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9f9]">
        <p className="text-xs text-[#444748] animate-pulse">Loading Ecclesia CMS...</p>
      </div>
    );
  }

  // ── Gate: not authenticated ──────────────────────────────────────────────
  if (!isAuthenticated) {
    return <AuthView onSuccessAuth={() => void handleAuthSuccess()} />;
  }

  // ── Gate: parish setup needed ────────────────────────────────────────────
  if (needsSetup) {
    return <SetupView onComplete={() => void handleSetupComplete()} />;
  }

  // ── Gate: forced password change ─────────────────────────────────────────
  if (mustChangePassword) {
    return <AuthView onSuccessAuth={() => void handlePasswordChangeComplete()} />;
  }

  // ── Cross-panel handoff helpers ──────────────────────────────────────────
  const handleSelectMemberForSacrament = (member: ChristianRecord) => {
    setSelectedMember(member);
    handleNavigate('sacraments', 'update_card');
  };
  const handleSelectMemberForPayment = (member: ChristianRecord) => {
    setSelectedMember(member);
    handleNavigate('activities', 'receive_payment');
  };

  return (
    <PermissionsProvider
      permissions={
        currentUser?.permissions ?? {
          panels: {
            christian: true, activities: true, sacraments: true, finance: true,
            ledgers: true, inventory: true, reports: true, hr: true, administration: true,
          },
          actions: { view: true, edit: true, delete: true },
        }
      }
    >
      <div className="min-h-screen flex flex-col bg-[#f9f9f9] text-[#1a1c1c] font-serif selection:bg-[#1e1e1e] selection:text-white">
        <TitleBar onSelectTab={handleNavigate} />
        <Header
          onSelectTab={(tab) => handleNavigate(tab)}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onOpenSearch={() => setIsSearchOpen(true)}
          user={currentUser}
        />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            currentTab={currentTab}
            onSelectTab={(tab) => handleNavigate(tab)}
            isOpen={isSidebarOpen}
            onCloseMobile={() => setIsSidebarOpen(false)}
            allowedPanels={allowedPanels}
          />
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-[#444748]">Loading...</div>}>
            {currentTab === 'dashboard' && (
              <DashboardView
                onNavigate={handleNavigate}
                memberCount={christians.filter(c => c.status === 'Active').length}
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
                onDeleteDeposit={handleDeleteDeposit}
                onDeleteCreditor={handleDeleteCreditor}
                onDeleteDebtor={handleDeleteDebtor}
                onDeleteExpense={handleDeleteExpense}
              />
            )}
            {currentTab === 'ledgers' && <LedgersView />}
            {currentTab === 'inventory' && <InventoryView />}
            {currentTab === 'reports' && <ReportsView />}
            {currentTab === 'hr' && <HRView />}
            {currentTab === 'administration' && <AdminView currentUserId={currentUser?.id ?? null} />}
            </Suspense>
            <Footer />
          </main>
        </div>
        <GlobalSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          christians={christians}
          onSelectMember={(member) => {
            setSelectedMember(member);
            handleNavigate('christian', 'find');
          }}
          onNavigate={handleNavigate}
        />
      </div>
    </PermissionsProvider>
  );
};

// ── Root: compose providers + server gate ──────────────────────────────────
/**
 * Main Application Component for Ecclesia Church Management System.
 * Composes context providers and renders the server connection gate or AppShell.
 */
export const App: React.FC = () => {
  const [serverConfigured, setServerConfigured] = React.useState(() => !!getServerUrl());

  if (!serverConfigured) {
    return <ServerConnection onConnected={() => setServerConfigured(true)} />;
  }

  return (
    <AuthProvider>
      <NavigationProvider>
        <DataProvider>
          <ChristiansProvider>
            <AppShell />
          </ChristiansProvider>
        </DataProvider>
      </NavigationProvider>
    </AuthProvider>
  );
};

export default App;
