// =============================================================================
// Permissions context — per-view access gating for the signed-in user
// -----------------------------------------------------------------------------
// Provides a lightweight `usePermissions()` hook that exposes the signed-in
// user's per-module panel + action rights. Views call canView/canEdit/canDelete
// to disable or hide write controls so the UI reflects what the backend's
// requireModule middleware enforces.
//
// The provider is mounted once in App.tsx around the authenticated shell with
// the session user's permissions; the fallback (no provider) is full access so
// isolated renders never break.
// =============================================================================
import React, { createContext, useContext, useMemo } from 'react';
import { PanelKey, PanelPermissions } from './types';

const FULL_PANELS: PanelPermissions['panels'] = {
  christian: true,
  activities: true,
  sacraments: true,
  finance: true,
  ledgers: true,
  inventory: true,
  reports: true,
  hr: true,
  administration: true
};

const FULL_ACTIONS: PanelPermissions['actions'] = { view: true, edit: true, delete: true };

/** The gating API consumed by views. */
export interface PermissionsApi {
  permissions: PanelPermissions;
  /** Whether the user may open the module at all. */
  canView: (panel: PanelKey) => boolean;
  /** Whether the user may create/edit records in the module. */
  canEdit: (panel: PanelKey) => boolean;
  /** Whether the user may delete records in the module. */
  canDelete: (panel: PanelKey) => boolean;
}

const fallback: PermissionsApi = {
  permissions: { panels: FULL_PANELS, actions: FULL_ACTIONS },
  canView: () => true,
  canEdit: () => true,
  canDelete: () => true
};

const PermissionsContext = createContext<PermissionsApi>(fallback);

/** Wraps the authenticated app shell with the signed-in user's permissions. */
export const PermissionsProvider: React.FC<{ permissions: PanelPermissions; children: React.ReactNode }> = ({
  permissions,
  children
}) => {
  const value = useMemo<PermissionsApi>(() => {
    const canView = (panel: PanelKey) => permissions.panels[panel] !== false;
    const canEdit = (panel: PanelKey) => canView(panel) && permissions.actions.edit !== false;
    const canDelete = (panel: PanelKey) => canView(panel) && permissions.actions.delete !== false;
    return { permissions, canView, canEdit, canDelete };
  }, [permissions]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};

/** Returns the current user's permission gating helpers (full access by default). */
export function usePermissions(): PermissionsApi {
  return useContext(PermissionsContext);
}
