// =============================================================================
// Ecclesia Backend — Module Permission Enforcement Middleware
// =============================================================================
//
// PURPOSE
//   Server-side guard that enforces per-module panel access AND per-action rights
//   (view / edit / delete) derived from the HTTP method. The frontend toggles
//   in the Rights Centre are NOT cosmetic — this middleware makes them real.
//
// ARCHITECTURE
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ requireModule(panel) — Returns Express middleware                       │
//   │   ├── Runs AFTER requireAuth (needs req.user with id, role)             │
//   │   ├── Calls loadPermissions(userId) to resolve effective rights        │
//   │   │   ├── super_admin → ALWAYS full access (bypass, never lock out)    │
//   │   │   ├── Global defaults: PanelPermissions singleton (id='default')   │
//   │   │   └── User overrides: User.panels + User.actions JSON columns      │
//   │   │       (missing fields fall back to global default → permissive)    │
//   │   ├── Maps HTTP method → action:                                       │
//   │   │   GET/HEAD      → 'view'                                            │
//   │   │   POST/PUT/PATCH→ 'edit'                                            │
//   │   │   DELETE        → 'delete'                                          │
//   │   └── Returns 403 if panels[panel]===false OR actions[action]===false  │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// MOUNTING PATTERN (inside each feature router)
//   const router = Router();
//   router.use(requireAuth);           // 1. Validate JWT, attach req.user
//   router.use(requireModule('panel')) // 2. Enforce panel + action rights
//   router.get(...);                   // 3. Route handlers (now protected)
//
// PANEL KEYS (must stay in sync with PanelKey in src/types.ts)
//   'christian' | 'activities' | 'sacraments' | 'finance' | 'ledgers' |
//   'inventory' | 'reports' | 'hr' | 'administration'
//
// PERMISSION RESOLUTION (loadPermissions)
//   1. Fetch User { role, panels, actions } by userId
//   2. If role === 'super_admin' → return fullPanels + fullActions
//   3. Fetch PanelPermissions singleton (id='default')
//   4. basePanels = parseJson(defaults?.panels) || defaultPanels
//   5. baseActions = parseJson(defaults?.actions) || defaultActions
//   6. effectivePanels = { ...basePanels, ...parseJson(user.panels) }
//   7. effectiveActions = { ...baseActions, ...parseJson(user.actions) }
//
// JSON PARSING SAFETY
//   - parseJson() catches malformed legacy column values → returns fallback
//   - This prevents a single corrupt JSON column from breaking all auth
//
// RELATED FILES
//   - backend/src/middleware/auth.ts   → requireAuth, AuthRequest type
//   - backend/src/routes/*.ts          → Mount requireModule('panel') per router
//   - backend/src/routes/admin.ts      → Rights Centre CRUD (Panels/Actions)
//   - src/permissions.tsx              → Frontend mirror (usePermissions hook)
//   - src/types.ts                     → PanelKey, PanelPermissions types
//   - backend/prisma/schema.prisma     → User.panels, User.actions, PanelPermissions
// =============================================================================

// Import Express types for the middleware signature (Response, NextFunction).
import { Response, NextFunction } from 'express';

// Import the Prisma client instance for database queries. appPrisma includes
// middleware that filters soft-deleted records and provides tenant isolation.
import { appPrisma } from '../lib/prisma.js';

// Import the AuthRequest type from the auth middleware. This extends Express
// Request with the authenticated user's id, email, and role properties.
import { AuthRequest } from './auth.js';

/**
 * Union type of all valid module/panel keys in the Ecclesia system.
 * Must stay synchronized with PanelKey in src/types.ts on the frontend.
 * Each key corresponds to a major functional area of the church management system.
 */
export type PanelKey =
  | 'christian'      // Christian records (baptisms, confirmations, memberships)
  | 'activities'     // Church activities, events, and programs
  | 'sacraments'     // Sacrament records (communion, marriage, etc.)
  | 'finance'        // Financial transactions and budget management
  | 'ledgers'        // Accounting ledgers and journal entries
  | 'inventory'      // Church property and inventory tracking
  | 'reports'        // Report generation and analytics dashboards
  | 'hr'             // Human resources and staff management
  | 'administration'; // System administration and configuration

/**
 * Union type of all valid action levels within a module.
 * Actions map to HTTP methods: view (GET/HEAD), edit (POST/PUT/PATCH), delete (DELETE).
 */
type PanelAction = 'view' | 'edit' | 'delete';

/**
 * Default panel access permissions — all panels enabled by default for new users.
 * This permissive default means new users can access all modules unless explicitly
 * restricted. Used as the fallback when no global defaults or user overrides exist.
 */
const defaultPanels: Record<PanelKey, boolean> = {
  christian: true,       // Access to Christian records module
  activities: true,      // Access to activities module
  sacraments: true,      // Access to sacraments module
  finance: true,         // Access to finance module
  ledgers: true,         // Access to ledgers module
  inventory: true,       // Access to inventory module
  reports: true,         // Access to reports module
  hr: true,              // Access to HR module
  administration: true,  // Access to administration module
};

/**
 * Default action permissions — all actions enabled by default for new users.
 * Maps action levels to boolean access flags. view=read, edit=create/update, delete=remove.
 */
const defaultActions: Record<PanelAction, boolean> = { view: true, edit: true, delete: true };

/**
 * Full access permissions granted to super_admin users.
 * Spread from defaultPanels to ensure all panel keys are present.
 * super_admin users bypass all permission checks and always get full access.
 */
const fullPanels: Record<PanelKey, boolean> = { ...defaultPanels };

/**
 * Full action permissions granted to super_admin users.
 * Explicitly sets all three actions to true — super_admin can view, edit, and delete.
 */
const fullActions: Record<PanelAction, boolean> = { view: true, edit: true, delete: true };

/**
 * Safe JSON parser that gracefully handles malformed or missing database values.
 *
 * The User.panels and User.actions columns store JSON strings in the database.
 * If a value is corrupted, truncated, or contains invalid JSON, this function
 * returns the provided fallback instead of throwing — preventing a single
 * corrupt record from breaking the entire permission system.
 *
 * @typeParam T - The expected type of the parsed JSON.
 * @param value   - The string value from the database column, or null/undefined.
 * @param fallback - The default value to return if parsing fails or value is empty.
 * @returns The parsed value if successful, otherwise the fallback.
 *
 * @example
 * const panels = parseJson<Record<string, boolean>>(user.panels, defaultPanels);
 * // If user.panels is '{"christian":false}', returns { christian: false }
 * // If user.panels is 'invalid json', returns defaultPanels
 * // If user.panels is null, returns defaultPanels
 */
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  // If the value is null, undefined, or empty string, return the fallback immediately.
  if (!value) return fallback;
  try {
    // If the value is already the expected type (e.g., an object), return it directly.
    // Otherwise, attempt to parse it as JSON.
    return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
  } catch {
    // JSON.parse() threw — the value contains malformed JSON. Return the fallback
    // rather than propagating the error, which would break the permission system.
    return fallback;
  }
}

/**
 * Loads the effective permissions (panels and actions) for a specific user.
 *
 * Permission resolution follows a layered approach:
 *   1. If the user is a super_admin, return full access immediately (bypass).
 *   2. Otherwise, fetch the global default permissions from PanelPermissions.
 *   3. Merge the global defaults with any user-specific overrides from User.panels/actions.
 *   4. User overrides take precedence over global defaults (shallow merge).
 *
 * This layered approach allows:
 *   - Organization-wide defaults to be set once in the Rights Centre.
 *   - Individual users to have their access fine-tuned.
 *   - super_admin users to always have full access regardless of configuration.
 *
 * @param userId - The unique identifier of the user whose permissions to load.
 * @returns An object with `panels` and `actions` maps indicating permitted access.
 *
 * @example
 * const { panels, actions } = await loadPermissions('user-uuid-123');
 * if (panels.finance === false) return 403; // User can't access finance module
 * if (actions.delete === false) return 403; // User can't delete in any module
 */
async function loadPermissions(userId: string) {
  // Fetch the user's role and stored permission overrides from the database.
  // We only select the three fields needed for permission resolution.
  const user = await appPrisma.user.findUnique({
    where: { id: userId },
    select: { role: true, panels: true, actions: true },
  });

  // If the user doesn't exist (deleted account), fall back to default permissions.
  // This should not happen in practice (requireAuth runs before this middleware),
  // but provides a defensive safety net.
  if (!user) return { panels: { ...defaultPanels }, actions: { ...defaultActions } };

  // super_admin users always get full access — bypass all permission checks.
  // This ensures the system administrator can never lock themselves out.
  if (user.role === 'super_admin') return { panels: fullPanels, actions: fullActions };

  // Fetch the global default permissions from the PanelPermissions singleton.
  // This record (id='default') is maintained by the admin in the Rights Centre UI.
  const defaults = await appPrisma.panelPermissions.findUnique({ where: { id: 'default' } });

  // Parse the global defaults from JSON, falling back to our hardcoded defaults
  // if the database values are missing or malformed.
  const basePanels = parseJson(defaults?.panels, defaultPanels);
  const baseActions = parseJson(defaults?.actions, defaultActions);

  // Merge global defaults with user-specific overrides.
  // User overrides take precedence (spread order matters — user values overwrite base).
  // Missing keys in user's overrides fall back to the global default (spread merges).
  return {
    panels: { ...basePanels, ...parseJson(user.panels, {}) },
    actions: { ...baseActions, ...parseJson(user.actions, {}) },
  };
}

/**
 * Maps an HTTP method to the permission action it represents.
 *
 * This mapping defines the semantic meaning of each HTTP verb in terms of
 * the permission system's three action levels:
 *   - GET/HEAD  → 'view'   (read-only access, no data modification)
 *   - POST/PUT/PATCH → 'edit' (create or modify data)
 *   - DELETE    → 'delete' (remove data permanently)
 *
 * @param method - The HTTP method string (uppercase) from req.method.
 * @returns The corresponding PanelAction: 'view', 'edit', or 'delete'.
 *
 * @example
 * methodAction('GET');    // returns 'view'
 * methodAction('POST');   // returns 'edit'
 * methodAction('DELETE'); // returns 'delete'
 */
function methodAction(method: string): PanelAction {
  // DELETE requests exercise the most destructive action.
  if (method === 'DELETE') return 'delete';

  // GET and HEAD are read-only operations — they only view data.
  if (method === 'GET' || method === 'HEAD') return 'view';

  // All other methods (POST, PUT, PATCH) are considered edit operations.
  // POST creates new records, PUT replaces records, PATCH partially updates them.
  return 'edit';
}

/**
 * Factory function that creates Express middleware to guard a router for one module.
 *
 * Returns a middleware function that:
 *   1. Verifies the user is authenticated (req.user must exist from requireAuth).
 *   2. Loads the user's effective permissions from the database.
 *   3. Checks that the user has access to the specified panel (module).
 *   4. Checks that the user has permission for the action implied by the HTTP method.
 *   5. Returns 403 if either check fails, or calls next() to proceed.
 *
 * @param panel - The PanelKey identifying which module to protect (e.g., 'finance').
 * @returns An Express middleware function that enforces panel + action permissions.
 *
 * @example
 * // Protect all finance routes — users must have finance panel + method-appropriate action:
 * router.use(requireAuth);
 * router.use(requireModule('finance'));
 * router.get('/transactions', listTransactions);     // requires finance panel + 'view'
 * router.post('/transactions', createTransaction);   // requires finance panel + 'edit'
 * router.delete('/transactions/:id', deleteTx);      // requires finance panel + 'delete'
 */
export function requireModule(panel: PanelKey) {
  // Return an async Express middleware that performs the permission check.
  // The middleware closure captures the `panel` parameter for later use.
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Defensive check: req.user must be populated by requireAuth before this
      // middleware runs. If not, return 401 to indicate missing authentication.
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Load the user's effective permissions by merging global defaults with
      // their personal overrides from the database. This is an async operation
      // because it requires a database query to fetch the PanelPermissions record.
      const { panels, actions } = await loadPermissions(req.user.id);

      // Check panel access: Does the user have permission to access this module?
      // panels[panel] being false means the panel was explicitly disabled for this user.
      if (panels[panel] === false) {
        return res.status(403).json({ error: 'You do not have access to this module' });
      }

      // Map the HTTP method to the action it implies (view/edit/delete).
      const action = methodAction(req.method);

      // Check action permission: Does the user have permission for this action?
      // actions[action] being false means this action level was explicitly disabled.
      if (actions[action] === false) {
        return res.status(403).json({ error: `You do not have permission to ${action} records in this module` });
      }

      // Both panel and action checks passed — proceed to the route handler.
      next();
    } catch (e) {
      // Database or permission resolution errors are passed to the centralized
      // error handler rather than returning a 403, since this is a server-side failure.
      next(e);
    }
  };
}
