// =============================================================================
// Ecclesia CMS — Permissions Context (Frontend Access Gating)
// =============================================================================
//
// PURPOSE
//   Lightweight React Context providing per-module panel + action rights for
//   the currently signed-in user. Views call canView/canEdit/canDelete to
//   disable or hide write controls so the UI reflects what the backend's
//   requireModule middleware enforces.
//
// ARCHITECTURE
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ PermissionsProvider (mounted once in App.tsx around authenticated shell) │
//   │   ├── Receives: currentUser.permissions from /api/auth/me               │
//   │   │   { panels: { christian: true, finance: false, ... },               │
//   │   │     actions: { view: true, edit: true, delete: false } }            │
//   │   └── Exposes via Context: PermissionsApi {                             │
//   │       permissions: PanelPermissions  // raw object for AdminView        │
//   │       canView(panel)    → panels[panel] !== false                       │
//   │       canEdit(panel)    → canView(panel) && actions.edit !== false      │
//   │       canDelete(panel)  → canView(panel) && actions.delete !== false    │
//   │   }                                                                     │
//   │                                                                          │
//   │ Fallback (no provider): FULL ACCESS — isolated renders never break      │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// USAGE IN VIEWS
//   const { canView, canEdit, canDelete } = usePermissions();
//   {canView('finance') && <FinanceTab />}
//   {canEdit('christian') && <button onClick={handleAdd}>Add Member</button>}
//   {canDelete('inventory') && <DeleteButton /> }
//
// PERMISSION RESOLUTION ORDER (mirrored in backend middleware/perms.ts)
//   1. super_admin role → ALWAYS full access (bypass all checks)
//   2. Global defaults (PanelPermissions singleton 'default' row)
//   3. User overrides (User.panels / User.actions JSON columns)
//   Missing fields fall back to global default → partial payloads stay permissive
//
// PANEL KEYS (must match PanelKey in types.ts AND backend middleware/perms.ts)
//   'christian' | 'activities' | 'sacraments' | 'finance' | 'ledgers' |
//   'inventory' | 'reports' | 'hr' | 'administration'
//
// RELATED FILES
//   - src/App.tsx                     → Mounts provider with currentUser.permissions
//   - src/types.ts                    → PanelKey, PanelPermissions, AuthUser types
//   - backend/src/middleware/perms.ts → Server-side enforcement (requireModule)
//   - backend/src/routes/admin.ts     → Rights Centre CRUD (panels/actions JSON)
//   - src/components/views/*.tsx      → Consume usePermissions() for UI gating
// =============================================================================
import React, { createContext, useContext, useMemo } from 'react';
import { PanelKey, PanelPermissions } from './types';

/**
 * Default "full access" panel permissions object.
 * Every panel is set to true, granting unrestricted access.
 * Used as the fallback value when no PermissionsProvider is mounted.
 */
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

/**
 * Default "full access" action permissions object.
 * view, edit, and delete are all set to true.
 * Used as the fallback value when no PermissionsProvider is mounted.
 */
const FULL_ACTIONS: PanelPermissions['actions'] = { view: true, edit: true, delete: true };

/**
 * The gating API consumed by views.
 * Provides the raw permissions object and three boolean check functions.
 */
export interface PermissionsApi {
  /** The raw PanelPermissions object (used by AdminView for rights management). */
  permissions: PanelPermissions;
  /** Whether the user may open the module at all. */
  canView: (panel: PanelKey) => boolean;
  /** Whether the user may create/edit records in the module. */
  canEdit: (panel: PanelKey) => boolean;
  /** Whether the user may delete records in the module. */
  canDelete: (panel: PanelKey) => boolean;
}

/**
 * Fallback permissions object — grants full access to everything.
 * Used when the PermissionsProvider is not mounted (e.g. during testing or isolated renders).
 */
const fallback: PermissionsApi = {
  permissions: { panels: FULL_PANELS, actions: FULL_ACTIONS },
  canView: () => true,
  canEdit: () => true,
  canDelete: () => true
};

/**
 * React Context that holds the PermissionsApi for the current session.
 * Defaults to the fallback (full access) if no provider is in the tree.
 */
const PermissionsContext = createContext<PermissionsApi>(fallback);

/**
 * Wraps the authenticated app shell with the signed-in user's permissions.
 * Memoizes the permission check functions to avoid unnecessary re-renders.
 *
 * @param {object} props - Component props.
 * @param {PanelPermissions} props.permissions - The user's resolved panel and action permissions.
 * @param {React.ReactNode} props.children - Child components that will have access to the permissions context.
 * @returns {JSX.Element} The PermissionsContext.Provider wrapping children.
 */
export const PermissionsProvider: React.FC<{ permissions: PanelPermissions; children: React.ReactNode }> = ({
  permissions,
  children
}) => {
  /**
   * Memoize the PermissionsApi object so that child components using usePermissions()
   * don't re-render on every parent render — only when the permissions object changes.
   */
  const value = useMemo<PermissionsApi>(() => {
    /**
     * Checks if the user can view a specific panel.
     * A panel is viewable if its value in permissions.panels is not explicitly false.
     * @param {PanelKey} panel - The panel to check.
     * @returns {boolean} True if the user can view the panel.
     */
    const canView = (panel: PanelKey) => permissions.panels[panel] !== false;

    /**
     * Checks if the user can edit records within a specific panel.
     * Requires both panel view access AND global edit action permission.
     * @param {PanelKey} panel - The panel to check.
     * @returns {boolean} True if the user can edit in the panel.
     */
    const canEdit = (panel: PanelKey) => canView(panel) && permissions.actions.edit !== false;

    /**
     * Checks if the user can delete records within a specific panel.
     * Requires both panel view access AND global delete action permission.
     * @param {PanelKey} panel - The panel to check.
     * @returns {boolean} True if the user can delete in the panel.
     */
    const canDelete = (panel: PanelKey) => canView(panel) && permissions.actions.delete !== false;

    return { permissions, canView, canEdit, canDelete };
  }, [permissions]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};

/**
 * Returns the current user's permission gating helpers (full access by default).
 * Must be used within a PermissionsProvider component tree.
 *
 * @returns {PermissionsApi} The permissions API with canView, canEdit, and canDelete functions.
 */
export function usePermissions(): PermissionsApi {
  return useContext(PermissionsContext);
}
