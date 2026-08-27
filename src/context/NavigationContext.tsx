// =============================================================================
// Ecclesia CMS — NavigationContext
// =============================================================================
//
// PURPOSE
//   Owns all navigation state (active panel, sub-tabs, sidebar/search UI,
//   cross-panel selectedMember handoff) and the handleNavigate dispatcher.
//   Keeps App.tsx free of tab-state bookkeeping.
//
// RELATED FILES
//   src/App.tsx          → Consumes NavigationContext for layout + panels
//   src/types.ts         → NavigationTab, SubTab types
//   src/services/api.ts  → clearStoredToken (used on logout)
// =============================================================================
import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  ActivitiesSubTab,
  ChristianRecord,
  ChristianSubTab,
  FinanceSubTab,
  NavigationTab,
  PanelKey,
  SacramentsSubTab,
} from '../types';
import { clearStoredToken } from '../services/api';
import { useAuth } from './AuthContext';

interface NavigationContextValue {
  currentTab: NavigationTab;
  christianSubTab: ChristianSubTab;
  activitiesSubTab: ActivitiesSubTab;
  sacramentsSubTab: SacramentsSubTab;
  financeSubTab: FinanceSubTab;
  isSidebarOpen: boolean;
  isSearchOpen: boolean;
  selectedMember: ChristianRecord | null;
  allowedPanels: PanelKey[];
  handleNavigate: (tab: NavigationTab, subTab?: string) => void;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedMember: React.Dispatch<React.SetStateAction<ChristianRecord | null>>;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, logout } = useAuth();

  const [currentTab, setCurrentTab] = useState<NavigationTab>('auth');
  const [christianSubTab, setChristianSubTab] = useState<ChristianSubTab>('add');
  const [activitiesSubTab, setActivitiesSubTab] = useState<ActivitiesSubTab>('receive_payment');
  const [sacramentsSubTab, setSacramentsSubTab] = useState<SacramentsSubTab>('update_card');
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>('make_deposit');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ChristianRecord | null>(null);

  /** Whether the signed-in user may open the given panel. */
  const canAccessTab = useCallback((tab: NavigationTab): boolean => {
    if (tab === 'dashboard' || tab === 'auth') return true;
    if (!currentUser) return false;
    const key = tab as PanelKey;
    return currentUser.permissions.panels[key] !== false;
  }, [currentUser]);

  const allowedPanels: PanelKey[] = (Object.keys(currentUser?.permissions.panels ?? {}) as PanelKey[]).filter(
    k => currentUser?.permissions.panels[k]
  );

  const handleNavigate = useCallback((tab: NavigationTab, subTab?: string) => {
    if (tab === 'auth') {
      logout();
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
  }, [canAccessTab, logout]);

  return (
    <NavigationContext.Provider
      value={{
        currentTab, christianSubTab, activitiesSubTab, sacramentsSubTab, financeSubTab,
        isSidebarOpen, isSearchOpen, selectedMember, allowedPanels,
        handleNavigate, setIsSidebarOpen, setIsSearchOpen, setSelectedMember,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

/** Convenience hook for consuming components. */
export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
