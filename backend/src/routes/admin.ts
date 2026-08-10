// =============================================================================
// Ecclesia Backend — Admin Routes (/api/admin)
// =============================================================================
//
// MOUNTED MIDDLEWARE CHAIN
//   router.use(requireAuth)        → Validates JWT, attaches req.user
//   router.use(requireAdmin)       → Ensures role is admin|super_admin
//   router.use(requireModule('administration'))
//                                    → Enforces panel+action rights for 'administration'
//                                    → super_admin bypasses; admin with panel=off gets 403
//
// ENDPOINT MAP
//   ┌─────────────────────────────┬──────────┬─────────────────────────────────────────┐
//   │ Path                        │ Method   │ Purpose                                 │
//   ├─────────────────────────────┼──────────┼─────────────────────────────────────────┤
//   │ /users                      │ GET      │ List all users (with lastLogin/Active)  │
//   │ /users                      │ POST     │ Create user (role defaults to staff)    │
//   │ /users/:id                  │ PUT      │ Update user (guards: no self-demote)    │
//   │ /users/:id                  │ DELETE   │ SOFT-delete via audit.ts (guards)       │
//   │ /users/:id/reset-password   │ POST     │ Generate one-time reset code (30 min)   │
//   │ /users/:id/permissions      │ GET      │ Fetch user's effective panels/actions   │
//   │ /users/:id/permissions      │ PUT      │ Override user's panels/actions JSON     │
//   │ /rights                     │ GET      │ Global default PanelPermissions singleton│
//   │ /rights                     │ PUT      │ Update global defaults                  │
//   │ /push-payments              │ GET      │ M-Pesa settings (secrets MASKED)        │
//   │ /push-payments              │ PUT      │ Update M-Pesa settings (preserve mask)  │
//   │ /audit-logs                 │ GET      │ Filtered audit trail (?entity=&action=) │
//   │ /audit-logs/:id/current     │ GET      │ Current record state for JSON diff      │
//   │ /audit-logs/restore-bulk    │ POST     │ Restore multiple soft-deleted records   │
//   │ /audit-logs/:id/restore     │ POST     │ Restore single record from audit log    │
//   │ /backup                     │ POST     │ Manual SQLite backup trigger            │
//   │ /export                     │ GET      │ Full parish data export (secrets stripped)│
//   │ /import                     │ POST     │ Full DB replace (super_admin + confirm) │
//   │ /diagnostics                │ GET      │ Health snapshot (no secrets)            │
//   └─────────────────────────────┴──────────┴─────────────────────────────────────────┘
//
// KEY SECURITY PATTERNS
//   1. SOFT DELETE ONLY — DELETE endpoints call audit.softDelete()
//      Records get isDeleted=true, deletedAt=now, auditLog entry created
//   2. SELF-PROTECTION — Users cannot deactivate/delete/demote their own account
//   3. SUPER_ADMIN GUARDS — Only super_admin can grant/modify super_admin roles
//   4. LAST SUPER_ADMIN — Cannot remove the sole super_admin account
//   5. CREDENTIAL MASKING — M-Pesa consumerKey/Secret never sent in responses
//      maskCredential() returns '••••••••••••••••' for any stored value
//      PUT /push-payments treats the mask as "keep existing value" sentinel
//   6. PASSWORD RESET TOKENS — One-time code returned ONCE in response, only
//      SHA-256 hash stored with 30-min TTL (resetTokenHash + resetTokenExpires)
//
// AUDIT LOG SYSTEM (lib/audit.ts)
//   - Every soft-delete writes AuditLog { entityName, entityId, action:'DELETE',
//     deletedBy, deletedByName, metadataSnapshot (JSON, passwordHash stripped) }
//   - Restore reads metadataSnapshot, recreates record, writes RESTORE audit entry
//   - listAuditLogs() supports filtering by entity, action, date range, actor
//   - /audit-logs/:id/current returns CURRENT DB state for diff comparison
//   - restoreBulk processes each ID independently, reports per-row success/fail
//
// RELATED FILES
//   - backend/src/lib/audit.ts         → softDelete, restoreFromLog, listAuditLogs
//   - backend/src/lib/backup.ts        → backupDatabase, scheduled backups
//   - backend/src/lib/export.ts        → exportAllData, importAllData
//   - backend/src/lib/diagnostics.ts   → collectDiagnostics
//   - backend/src/middleware/auth.ts   → requireAuth, requireAdmin, requireSuperAdmin
//   - backend/src/middleware/perms.ts  → requireModule
//   - backend/prisma/schema.prisma     → User, PanelPermissions, PushPaymentSettings,
//                                         AuditLog, PushPaymentSettings models
//   - src/services/api.ts (adminApi)   → Frontend typed client for these endpoints
// =============================================================================

// Express Router constructor — creates a modular, mountable router instance
import { Router } from 'express';

// Zod schema validation library — used for runtime type checking of request bodies and query params
import { z } from 'zod';

// Prisma clients: appPrisma (with middleware for soft-delete filtering) and raw prisma (unfiltered for uniqueness checks)
import { appPrisma, prisma } from '../lib/prisma.js';

// Authentication utilities: hashPassword for secure password storage, generateResetToken for one-time codes, hashResetToken for SHA-256 hashing
import { hashPassword, generateResetToken, hashResetToken } from '../lib/auth.js';

// Auth middleware: requireAuth validates JWT, requireAdmin checks admin role, requireSuperAdmin checks super_admin role, AuthRequest type extends Request with user
import { requireAdmin, requireAuth, requireSuperAdmin, AuthRequest } from '../middleware/auth.js';

// Permission middleware: requireModule checks panel-specific access rights for the administration module
import { requireModule } from '../middleware/perms.js';

// Audit utilities: softDelete for marking records deleted, restoreFromLog for restoring, listAuditLogs for querying audit trail, resolveActor for user info, loadCurrentRecord for current state, restoreMany for bulk restore, HttpError for custom errors
import { softDelete, restoreFromLog, listAuditLogs, resolveActor, loadCurrentRecord, restoreMany, HttpError } from '../lib/audit.js';

// Backup utility: backupDatabase creates SQLite database snapshots
import { backupDatabase } from '../lib/backup.js';

// Export/Import utilities: exportAllData bundles all parish data, importAllData restores from bundle, ExportBundle type for data structure
import { exportAllData, importAllData, ExportBundle } from '../lib/export.js';

// Diagnostics utility: collectDiagnostics gathers system health information
import { collectDiagnostics } from '../lib/diagnostics.js';

// Create a new Express Router instance for admin endpoints
const router = Router();

// Middleware chain: requireAuth validates JWT token and attaches user to request
router.use(requireAuth);

// Middleware chain: requireAdmin ensures the authenticated user has admin or super_admin role
router.use(requireAdmin);

// Panel guard after the role guard: super_admin bypasses it (full access) while
// an admin whose "Administration" panel was disabled in the Rights Centre is cut
// off from the admin surface.
router.use(requireModule('administration'));

// Password reset token time-to-live: 30 minutes in milliseconds (30 * 60 * 1000)
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Default panel permissions: all modules enabled by default for new users
const defaultPanels = {
  christian: true,    // Christian member management panel
  activities: true,   // Activities/events panel
  sacraments: true,   // Sacraments tracking panel
  finance: true,      // Finance management panel
  ledgers: true,      // Ledger/cashier panel
  inventory: true,    // Inventory management panel
  reports: true,      // Reports generation panel
  hr: true,           // Human resources panel
  administration: true, // Administration panel (this module)
};

// Default action permissions: view, edit, and delete actions enabled by default
const defaultActions = { view: true, edit: true, delete: true };

// User role constants: defines valid roles in hierarchy order from highest to lowest privileges
const USER_ROLES = ['super_admin', 'admin', 'staff', 'viewer'] as const;

// Placeholder returned in place of stored gateway credentials. A real M-Pesa
// consumer key/secret never contains bullet characters, so the string is safe
// to use both as a display mask and as a sentinel meaning "keep existing value".
const MASKED_PLACEHOLDER = '••••••••••••••••';

/**
 * Masks a stored gateway credential for API responses: an empty string is kept
 * empty (nothing configured) and a stored value is replaced by the placeholder
 * so plaintext secrets are never sent over the wire.
 */
function maskCredential(value: string | null | undefined): string {
  return value ? MASKED_PLACEHOLDER : '';
}

// Serializes a value to JSON string: returns string as-is, otherwise JSON.stringify
function serializeJson<T>(value: T): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Parses JSON string with fallback: returns fallback if value is null/undefined/empty or parsing fails
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return fallback;
  }
}

// Transforms a user object to a safe public representation: strips sensitive fields like passwordHash, resetTokenHash, etc.
function publicUser(u: any) {
  return {
    id: u.id,           // User's unique identifier
    name: u.name,       // User's full name
    email: u.email,     // User's email address (used for login)
    title: u.title ?? null, // Optional job title or position
    role: u.role,       // User's role (super_admin, admin, staff, viewer)
    isActive: u.isActive, // Whether the user account is active
    lastLoginAt: u.lastLoginAt ?? null, // Timestamp of last successful login
    lastActiveAt: u.lastActiveAt ?? null, // Timestamp of last activity
    createdAt: u.createdAt, // Account creation timestamp
  };
}

// ---------- User Management ----------

// GET /users — List all users with their login/activity status, ordered by creation date
router.get('/users', async (_req, res, next) => {
  try {
    // Query all users from database, ordered by creation date ascending
    const users = await appPrisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    // Transform each user to safe public format and return as JSON array
    res.json(users.map(publicUser));
  } catch (e) { next(e); } // Pass errors to Express error handler
});

// POST /users — Create a new user account with validation and security checks
router.post('/users', async (req: AuthRequest, res, next) => {
  try {
    // Validate request body against Zod schema: requires name, email, password (min 8 chars), optional title, role defaults to 'staff'
    const data = z.object({
      name: z.string().min(1),           // User's full name (required, non-empty)
      email: z.string().email(),         // Valid email address (required)
      password: z.string().min(8),       // Password with minimum 8 characters (required)
      title: z.string().max(100).optional(), // Optional job title, max 100 chars
      role: z.enum(USER_ROLES).default('staff'), // Role from predefined list, defaults to 'staff'
    }).parse(req.body);

    // Security check: only super_admin can grant super_admin role
    if (data.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can grant super admin access' });
    }

    // Check unfiltered table so soft-deleted users keep their email reserved (prevents re-registration)
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // Hash password securely before storage (bcrypt or argon2)
    const passwordHash = await hashPassword(data.password);
    // Create new user in database with hashed password and mustChangePassword flag
    const user = await appPrisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        title: data.title ?? null,
        role: data.role,
        // Temp password set by an admin: force the user to choose their own at
        // first sign-in.
        mustChangePassword: true,
      },
    });
    // Return created user in safe public format with 201 Created status
    res.status(201).json(publicUser(user));
  } catch (e) { next(e); } // Pass validation or database errors to error handler
});

// PUT /users/:id — Update an existing user's information with security guards
router.put('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    // Validate request body: all fields optional for partial updates
    const data = z.object({
      name: z.string().min(1).optional(),           // Updated name (optional)
      email: z.string().email().optional(),         // Updated email (optional)
      password: z.string().min(8).optional(),       // New password (optional, triggers mustChangePassword)
      title: z.string().max(100).nullable().optional(), // Updated title (optional, nullable)
      role: z.enum(USER_ROLES).optional(),          // Updated role (optional)
      isActive: z.boolean().optional(),             // Account active status (optional)
    }).parse(req.body);

    // Fetch target user from database to verify existence and check permissions
    const target = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    // The primary account cannot be deactivated, deleted or demoted by anyone (including itself).
    // Security: only super_admin can modify another super_admin account
    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can modify a super admin account' });
    }
    // Prevent users from deactivating their own account (self-protection)
    if (target.id === req.user?.id && data.isActive === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    // Prevent users from demoting their own account (self-protection)
    if (target.id === req.user?.id && data.role && data.role !== 'super_admin') {
      return res.status(400).json({ error: 'You cannot demote your own account' });
    }
    // Prevent non-super_admin from granting super_admin role
    if (data.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can grant super admin access' });
    }

    // Build update object, copying validated data
    const update: any = { ...data };
    // If password is being updated, hash it and force password change on next login
    if (data.password) {
      update.passwordHash = await hashPassword(data.password);
      // A password assigned by an admin is temporary — force the user to choose
      // their own at their next sign-in, matching the create-user flow.
      update.mustChangePassword = true;
      // Remove plain text password from update object (only hash stored)
      delete update.password;
    }
    // Apply updates to user record in database
    const user = await appPrisma.user.update({ where: { id: target.id }, data: update });
    // Return updated user in safe public format
    res.json(publicUser(user));
  } catch (e) { next(e); } // Pass errors to error handler
});

// DELETE /users/:id — Soft-delete a user account (except yourself and except the last super admin)
router.delete('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    // Fetch target user to verify existence and check deletion guards
    const target = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Prevent users from deleting their own account (self-protection)
    if (target.id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }
    // Security: only super_admin can delete another super_admin account
    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can remove a super admin account' });
    }

    // Count remaining super_admin accounts to prevent removing the last one
    const superAdminCount = await appPrisma.user.count({ where: { role: 'super_admin' } });
    if (target.role === 'super_admin' && superAdminCount <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last super admin account' });
    }

    // Resolve actor information for audit log (user who performed the deletion)
    const actor = await resolveActor(req.user!.id);
    // Perform soft-delete: marks record as deleted, creates audit log entry
    await softDelete('User', target.id, actor);
    // Return 204 No Content on successful deletion
    res.status(204).end();
  } catch (e) { next(e); } // Pass errors to error handler
});

// Generate a one-time password-reset code for a user. The code is returned in
// the response exactly once (the admin shares it offline with the user); only
// its SHA-256 hash is stored, valid for 30 minutes.
router.post('/users/:id/reset-password', async (req: AuthRequest, res, next) => {
  try {
    // Fetch target user to verify existence and check reset guards
    const target = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Prevent users from resetting their own password (should use Change Password flow)
    if (target.id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot reset your own password. Use Change Password instead.' });
    }
    // Security: only super_admin can reset another super_admin's password
    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can reset a super admin account' });
    }

    // Generate cryptographically secure one-time reset token
    const token = generateResetToken();
    // Update user record with hashed token and expiration time (30 minutes from now)
    await appPrisma.user.update({
      where: { id: target.id },
      data: {
        resetTokenHash: hashResetToken(token), // Store SHA-256 hash, not plain token
        resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS), // Expiration timestamp
        resetFailedAttempts: 0, // Reset failed attempt counter
      },
    });
    // Return plain token once (admin shares offline) and expiration info
    res.json({ code: token, expiresInMinutes: RESET_TOKEN_TTL_MS / 60000 });
  } catch (e) { next(e); } // Pass errors to error handler
});

// ---------- Per-user Permissions ----------

// Helper function to extract user permissions with defaults for missing values
function getUserPermissions(user: any) {
  return {
    panels: parseJson(user.panels, defaultPanels),   // Panel access permissions (JSON string → object)
    actions: parseJson(user.actions, defaultActions), // Action permissions (JSON string → object)
  };
}

// GET /users/:id/permissions — Fetch a user's effective panel and action permissions
router.get('/users/:id/permissions', async (req, res, next) => {
  try {
    // Fetch user to verify existence and retrieve permission data
    const user = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Return parsed permissions with defaults applied
    res.json(getUserPermissions(user));
  } catch (e) { next(e); } // Pass errors to error handler
});

// PUT /users/:id/permissions — Override a user's panel and action permissions
router.put('/users/:id/permissions', async (req, res, next) => {
  try {
    // Validate request body: requires panels (record of string→boolean) and actions object
    const data = z.object({
      panels: z.record(z.string(), z.boolean()), // Panel permissions: { panelName: enabled }
      actions: z.object({
        view: z.boolean(),   // Can view data in panels
        edit: z.boolean(),   // Can edit data in panels
        delete: z.boolean(), // Can delete data in panels
      }),
    }).parse(req.body);

    // Update user's permissions in database (store as JSON strings)
    const user = await appPrisma.user.update({
      where: { id: req.params.id },
      data: {
        panels: serializeJson(data.panels),   // Serialize panels object to JSON string
        actions: serializeJson(data.actions), // Serialize actions object to JSON string
      },
    });
    // Return updated permissions with defaults applied
    res.json(getUserPermissions(user));
  } catch (e) { next(e); } // Pass errors to error handler
});

// GET /rights — Fetch global default panel permissions (singleton record)
router.get('/rights', async (_req, res, next) => {
  try {
    // Try to fetch existing default permissions record
    let row = await appPrisma.panelPermissions.findUnique({ where: { id: 'default' } });
    // If no default exists, create it with default values
    if (!row) {
      row = await appPrisma.panelPermissions.create({
        data: { id: 'default', panels: serializeJson(defaultPanels), actions: serializeJson(defaultActions) },
      });
    }
    // Return parsed permissions with defaults applied
    res.json({ panels: parseJson(row.panels, defaultPanels), actions: parseJson(row.actions, defaultActions) });
  } catch (e) { next(e); } // Pass errors to error handler
});

// PUT /rights — Update global default panel permissions (creates if not exists)
router.put('/rights', async (req, res, next) => {
  try {
    // Validate request body: requires panels and actions objects
    const data = z.object({
      panels: z.record(z.string(), z.boolean()), // Panel permissions: { panelName: enabled }
      actions: z.object({
        view: z.boolean(),   // Default view permission
        edit: z.boolean(),   // Default edit permission
        delete: z.boolean(), // Default delete permission
      }),
    }).parse(req.body);

    // Upsert default permissions: create if not exists, update if exists
    const row = await appPrisma.panelPermissions.upsert({
      where: { id: 'default' },
      create: { id: 'default', panels: serializeJson(data.panels), actions: serializeJson(data.actions) },
      update: { panels: serializeJson(data.panels), actions: serializeJson(data.actions) },
    });
    // Return updated permissions with parsed values
    res.json({ panels: parseJson(row.panels, data.panels), actions: parseJson(row.actions, data.actions) });
  } catch (e) { next(e); } // Pass errors to error handler
});

// GET /push-payments — Fetch M-Pesa push payment settings with masked credentials
router.get('/push-payments', async (_req, res, next) => {
  try {
    // Try to fetch existing push payment settings
    let row = await appPrisma.pushPaymentSettings.findUnique({ where: { id: 'default' } });
    // If no settings exist, create empty default record
    if (!row) {
      row = await appPrisma.pushPaymentSettings.create({ data: { id: 'default' } });
    }
    // Return settings with sensitive credentials masked for security
    res.json({
      paybill: row.paybill,           // M-Pesa paybill number
      accountFormat: row.accountFormat, // Account number format template
      consumerKey: maskCredential(row.consumerKey), // Masked API consumer key
      consumerSecret: maskCredential(row.consumerSecret), // Masked API consumer secret
      mode: row.mode,                 // 'sandbox' or 'live' environment
      testPhone: row.testPhone,       // Test phone number for sandbox
      testAmount: row.testAmount,     // Test amount for sandbox transactions
      hasConsumerKey: Boolean(row.consumerKey), // Boolean flag: key exists (not empty)
      hasConsumerSecret: Boolean(row.consumerSecret), // Boolean flag: secret exists (not empty)
    });
  } catch (e) { next(e); } // Pass errors to error handler
});

// PUT /push-payments — Update M-Pesa push payment settings (preserves masked credentials)
router.put('/push-payments', async (req, res, next) => {
  try {
    // Validate request body: all fields required for complete update
    const data = z.object({
      paybill: z.string(),           // M-Pesa paybill number
      accountFormat: z.string(),     // Account number format template
      consumerKey: z.string(),       // API consumer key (may be masked placeholder)
      consumerSecret: z.string(),   // API consumer secret (may be masked placeholder)
      mode: z.enum(['sandbox', 'live']), // Environment mode
      testPhone: z.string(),         // Test phone number
      testAmount: z.string(),        // Test amount
    }).parse(req.body);

    // A submitted masked placeholder means the admin left the field untouched:
    // keep the previously stored credential instead of overwriting it with the
    // mask. Any other value (including '') is written as-is.
    // Fetch existing settings to preserve credentials if masked placeholder submitted
    const existing = await appPrisma.pushPaymentSettings.findUnique({ where: { id: 'default' } });
    // If consumer key is masked placeholder, keep existing value; otherwise use submitted value
    const consumerKey = data.consumerKey === MASKED_PLACEHOLDER ? (existing?.consumerKey ?? '') : data.consumerKey;
    // Same logic for consumer secret
    const consumerSecret = data.consumerSecret === MASKED_PLACEHOLDER ? (existing?.consumerSecret ?? '') : data.consumerSecret;

    // Build update payload with resolved credential values
    const payload = {
      paybill: data.paybill,
      accountFormat: data.accountFormat,
      consumerKey,
      consumerSecret,
      mode: data.mode,
      testPhone: data.testPhone,
      testAmount: data.testAmount,
    };
    // Upsert settings: create if not exists, update if exists
    const row = await appPrisma.pushPaymentSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...payload },
      update: payload,
    });
    // Return updated settings with masked credentials
    res.json({
      paybill: row.paybill,
      accountFormat: row.accountFormat,
      consumerKey: maskCredential(row.consumerKey),
      consumerSecret: maskCredential(row.consumerSecret),
      mode: row.mode,
      testPhone: row.testPhone,
      testAmount: row.testAmount,
      hasConsumerKey: Boolean(row.consumerKey),
      hasConsumerSecret: Boolean(row.consumerSecret),
    });
  } catch (e) { next(e); } // Pass errors to error handler
});

// ---------- Trash & Audit Log ----------

// GET /audit-logs — Fetch filtered audit trail with optional entity, action, date range, and actor filters
router.get('/audit-logs', async (req, res, next) => {
  try {
    // Extract query parameters for filtering (all optional)
    const { entity, action, from, to, actor } = req.query as Record<string, string | undefined>;
    // Query audit logs with filters applied (delegates to audit.ts listAuditLogs)
    res.json(await listAuditLogs({ entity, action, from, to, actor }));
  } catch (e) { next(e); } // Pass errors to error handler
});

// GET /audit-logs/:id/current — Current state of the record referenced by an audit log — powers the JSON diff
// modal in Trash & Audit (snapshot vs. now).
router.get('/audit-logs/:id/current', async (req, res, next) => {
  try {
    // Fetch audit log entry to identify the referenced record
    const log = await appPrisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) throw new HttpError(404, 'Audit log not found');
    // Load current database state of the referenced record (may differ from snapshot)
    res.json({ current: await loadCurrentRecord(log.entityName, log.entityId) });
  } catch (e) { next(e); } // Pass errors to error handler
});

// POST /audit-logs/restore-bulk — Bulk restore: one request restores every selected deleted record. Independent
// per-row failures are reported back rather than aborting the whole batch.
router.post('/audit-logs/restore-bulk', async (req: AuthRequest, res, next) => {
  try {
    // Validate request body: requires array of audit log IDs (at least one)
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    // Resolve actor information for audit log entries
    const actor = await resolveActor(req.user!.id);
    // Restore multiple records: processes each ID independently, returns per-row results
    res.json(await restoreMany(ids, actor));
  } catch (e) { next(e); } // Pass errors to error handler
});

// POST /audit-logs/:id/restore — Restore a single record from an audit log entry
router.post('/audit-logs/:id/restore', async (req: AuthRequest, res, next) => {
  try {
    // Resolve actor information for audit log entry
    const actor = await resolveActor(req.user!.id);
    // Restore single record: reads metadata snapshot, recreates record, writes RESTORE audit entry
    await restoreFromLog(req.params.id, actor);
    // Return success message
    res.json({ message: 'Record restored successfully' });
  } catch (e) { next(e); } // Pass errors to error handler
});

// ---------- Backup, Export & Diagnostics ----------

// POST /backup — Manual backup trigger — support / admin can snapshot on demand.
router.post('/backup', async (_req, res, next) => {
  try {
    // Execute database backup (creates SQLite snapshot file)
    const info = await backupDatabase();
    // Return backup metadata: filename, size in bytes, timestamp
    res.json({ file: info.file, sizeBytes: info.size, at: info.at.toISOString() });
  } catch (e) { next(e); } // Pass errors to error handler
});

// GET /export — Full parish data export (the exit path): every table as one JSON document,
// secrets stripped and M-Pesa credentials masked.
router.get('/export', async (_req, res, next) => {
  try {
    // Export all parish data: bundles every table into single JSON document
    // Secrets stripped, M-Pesa credentials masked for security
    res.json(await exportAllData());
  } catch (e) { next(e); } // Pass errors to error handler
});

// POST /import — Destructive full import: replaces the entire database. Super admin only, and
// requires an explicit `{ confirm: true }` to guard against accidental wipes.
router.post('/import', requireSuperAdmin, async (req: AuthRequest, res, next) => {
  try {
    // Validate request body: requires confirm flag (must be true) and bundle data
    const { bundle } = z
      .object({ confirm: z.literal(true), bundle: z.unknown() }) // confirm must be literal true
      .parse(req.body);
    // Import data bundle: replaces entire database (destructive operation)
    const count = await importAllData(bundle as ExportBundle, req.user?.id);
    // Return import summary with record count
    res.json({ message: `Import complete: ${count} records restored.` });
  } catch (e) { next(e); } // Pass errors to error handler
});

// GET /diagnostics — Support diagnostics — health snapshot without secrets.
router.get('/diagnostics', async (_req, res, next) => {
  try {
    // Collect system diagnostics: health info, versions, configuration (no secrets)
    res.json(await collectDiagnostics());
  } catch (e) { next(e); } // Pass errors to error handler
});

// Export the configured router for mounting in the main Express app
export default router;