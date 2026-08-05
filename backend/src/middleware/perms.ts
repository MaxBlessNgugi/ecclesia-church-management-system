// =============================================================================
// Module permission enforcement middleware
// -----------------------------------------------------------------------------
// requireModule(panel) guards an entire router so that panel-level access AND
// per-action rights (view / edit / delete, derived from the HTTP method) are
// enforced server-side — the frontend toggles in the Rights Centre are no
// longer cosmetic.
//
// Resolution order (loadPermissions):
//   1. super_admin always bypasses (full access) so the primary account can
//      never lock itself out of a module or the admin surface.
//   2. Otherwise the global PanelPermissions singleton supplies defaults, then
//      the user's own panels/actions JSON overrides them. Missing fields fall
//      back to the global default so partial payloads stay permissive.
//
// The guard must run AFTER requireAuth (it needs req.user) — mount it inside a
// router right after its `router.use(requireAuth)` line.
// =============================================================================
import { Request, Response, NextFunction } from 'express';
import { appPrisma } from '../lib/prisma.js';
import { AuthRequest } from './auth.js';

/** Module keys — must stay in sync with PanelKey in src/types.ts. */
export type PanelKey =
  | 'christian'
  | 'activities'
  | 'sacraments'
  | 'finance'
  | 'ledgers'
  | 'inventory'
  | 'reports'
  | 'hr'
  | 'administration';

type PanelAction = 'view' | 'edit' | 'delete';

const defaultPanels: Record<PanelKey, boolean> = {
  christian: true,
  activities: true,
  sacraments: true,
  finance: true,
  ledgers: true,
  inventory: true,
  reports: true,
  hr: true,
  administration: true,
};

const defaultActions: Record<PanelAction, boolean> = { view: true, edit: true, delete: true };

const fullPanels: Record<PanelKey, boolean> = { ...defaultPanels };
const fullActions: Record<PanelAction, boolean> = { view: true, edit: true, delete: true };

/** Safe JSON parse — malformed legacy column values degrade to the fallback. */
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
  } catch {
    return fallback;
  }
}

/**
 * Loads the effective { panels, actions } for a user: super_admin bypass, then
 * the global default merged with the user's own overrides.
 */
async function loadPermissions(userId: string) {
  const user = await appPrisma.user.findUnique({
    where: { id: userId },
    select: { role: true, panels: true, actions: true },
  });
  if (!user) return { panels: { ...defaultPanels }, actions: { ...defaultActions } };
  if (user.role === 'super_admin') return { panels: fullPanels, actions: fullActions };

  const defaults = await appPrisma.panelPermissions.findUnique({ where: { id: 'default' } });
  const basePanels = parseJson(defaults?.panels, defaultPanels);
  const baseActions = parseJson(defaults?.actions, defaultActions);

  return {
    panels: { ...basePanels, ...parseJson(user.panels, {}) },
    actions: { ...baseActions, ...parseJson(user.actions, {}) },
  };
}

/** Maps the HTTP method to the action level it exercises. */
function methodAction(method: string): PanelAction {
  if (method === 'DELETE') return 'delete';
  if (method === 'GET' || method === 'HEAD') return 'view';
  return 'edit';
}

/**
 * Guards a router for one module. Returns 403 when the user's panel access is
 * off, or when the action implied by the HTTP method (GET→view, DELETE→delete,
 * POST/PUT/PATCH→edit) is disabled for them.
 */
export function requireModule(panel: PanelKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { panels, actions } = await loadPermissions(req.user.id);
      if (panels[panel] === false) {
        return res.status(403).json({ error: 'You do not have access to this module' });
      }
      const action = methodAction(req.method);
      if (actions[action] === false) {
        return res.status(403).json({ error: `You do not have permission to ${action} records in this module` });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Re-export the raw loader so other middleware (e.g. per-endpoint overrides)
// can resolve permissions without duplicating the merge logic.
export { loadPermissions };
