// =============================================================================
// Admin routes — mounted at /api/admin (requireAuth + requireAdmin on all)
// -----------------------------------------------------------------------------
// User management:
//   GET/POST/PUT/DELETE /users        CRUD users; DELETE is SOFT via audit.ts.
//                                     Guards: can't touch your own account, can't
//                                     remove the last super_admin, only super_admin
//                                     can grant/modify super_admin roles.
//   GET/PUT /users/:id/permissions    per-user panel/action toggles.
// Permissions & settings:
//   GET/PUT /rights                   default panel_permissions singleton.
//   GET/PUT /push-payments            MPESA push settings singleton (secret stored
//                                     in plaintext SQLite column — see note below).
// Trash & Audit:
//   GET /audit-logs                   filtered by ?entity=&action=.
//   POST /audit-logs/:id/restore      restore a soft-deleted record by log id.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma, prisma } from '../lib/prisma.js';
import { hashPassword, generateResetToken, hashResetToken } from '../lib/auth.js';
import { requireAdmin, requireAuth, requireSuperAdmin, AuthRequest } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { softDelete, restoreFromLog, listAuditLogs, resolveActor, loadCurrentRecord, restoreMany, HttpError } from '../lib/audit.js';
import { backupDatabase } from '../lib/backup.js';
import { exportAllData, importAllData, ExportBundle } from '../lib/export.js';
import { collectDiagnostics } from '../lib/diagnostics.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);
// Panel guard after the role guard: super_admin bypasses it (full access) while
// an admin whose "Administration" panel was disabled in the Rights Centre is cut
// off from the admin surface.
router.use(requireModule('administration'));

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const defaultPanels = {
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

const defaultActions = { view: true, edit: true, delete: true };

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

function serializeJson<T>(value: T): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return fallback;
  }
}

function publicUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    title: u.title ?? null,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ?? null,
    lastActiveAt: u.lastActiveAt ?? null,
    createdAt: u.createdAt,
  };
}

// ---------- User Management ----------

router.get('/users', async (_req, res, next) => {
  try {
    const users = await appPrisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users.map(publicUser));
  } catch (e) { next(e); }
});

router.post('/users', async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      title: z.string().max(100).optional(),
      role: z.enum(USER_ROLES).default('staff'),
    }).parse(req.body);

    if (data.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can grant super admin access' });
    }

    // Check the unfiltered table so soft-deleted users keep their email reserved.
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await hashPassword(data.password);
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
    res.status(201).json(publicUser(user));
  } catch (e) { next(e); }
});

router.put('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      password: z.string().min(8).optional(),
      title: z.string().max(100).nullable().optional(),
      role: z.enum(USER_ROLES).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const target = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    // The primary account cannot be deactivated, deleted or demoted by anyone (including itself).
    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can modify a super admin account' });
    }
    if (target.id === req.user?.id && data.isActive === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    if (target.id === req.user?.id && data.role && data.role !== 'super_admin') {
      return res.status(400).json({ error: 'You cannot demote your own account' });
    }
    if (data.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can grant super admin access' });
    }

    const update: any = { ...data };
    if (data.password) {
      update.passwordHash = await hashPassword(data.password);
      delete update.password;
    }
    const user = await appPrisma.user.update({ where: { id: target.id }, data: update });
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

// Soft-delete a user account (except yourself and except the last super admin)
router.delete('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    const target = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }
    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can remove a super admin account' });
    }

    const superAdminCount = await appPrisma.user.count({ where: { role: 'super_admin' } });
    if (target.role === 'super_admin' && superAdminCount <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last super admin account' });
    }

    const actor = await resolveActor(req.user!.id);
    await softDelete('User', target.id, actor);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Generate a one-time password-reset code for a user. The code is returned in
// the response exactly once (the admin shares it offline with the user); only
// its SHA-256 hash is stored, valid for 30 minutes.
router.post('/users/:id/reset-password', async (req: AuthRequest, res, next) => {
  try {
    const target = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot reset your own password. Use Change Password instead.' });
    }
    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can reset a super admin account' });
    }

    const token = generateResetToken();
    await appPrisma.user.update({
      where: { id: target.id },
      data: {
        resetTokenHash: hashResetToken(token),
        resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        resetFailedAttempts: 0,
      },
    });
    res.json({ code: token, expiresInMinutes: RESET_TOKEN_TTL_MS / 60000 });
  } catch (e) { next(e); }
});

// ---------- Per-user Permissions ----------

function getUserPermissions(user: any) {
  return {
    panels: parseJson(user.panels, defaultPanels),
    actions: parseJson(user.actions, defaultActions),
  };
}

router.get('/users/:id/permissions', async (req, res, next) => {
  try {
    const user = await appPrisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(getUserPermissions(user));
  } catch (e) { next(e); }
});

router.put('/users/:id/permissions', async (req, res, next) => {
  try {
    const data = z.object({
      panels: z.record(z.string(), z.boolean()),
      actions: z.object({
        view: z.boolean(),
        edit: z.boolean(),
        delete: z.boolean(),
      }),
    }).parse(req.body);

    const user = await appPrisma.user.update({
      where: { id: req.params.id },
      data: {
        panels: serializeJson(data.panels),
        actions: serializeJson(data.actions),
      },
    });
    res.json(getUserPermissions(user));
  } catch (e) { next(e); }
});

router.get('/rights', async (_req, res, next) => {
  try {
    let row = await appPrisma.panelPermissions.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await appPrisma.panelPermissions.create({
        data: { id: 'default', panels: serializeJson(defaultPanels), actions: serializeJson(defaultActions) },
      });
    }
    res.json({ panels: parseJson(row.panels, defaultPanels), actions: parseJson(row.actions, defaultActions) });
  } catch (e) { next(e); }
});

router.put('/rights', async (req, res, next) => {
  try {
    const data = z.object({
      panels: z.record(z.string(), z.boolean()),
      actions: z.object({
        view: z.boolean(),
        edit: z.boolean(),
        delete: z.boolean(),
      }),
    }).parse(req.body);

    const row = await appPrisma.panelPermissions.upsert({
      where: { id: 'default' },
      create: { id: 'default', panels: serializeJson(data.panels), actions: serializeJson(data.actions) },
      update: { panels: serializeJson(data.panels), actions: serializeJson(data.actions) },
    });
    res.json({ panels: parseJson(row.panels, data.panels), actions: parseJson(row.actions, data.actions) });
  } catch (e) { next(e); }
});

router.get('/push-payments', async (_req, res, next) => {
  try {
    let row = await appPrisma.pushPaymentSettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await appPrisma.pushPaymentSettings.create({ data: { id: 'default' } });
    }
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
  } catch (e) { next(e); }
});

router.put('/push-payments', async (req, res, next) => {
  try {
    const data = z.object({
      paybill: z.string(),
      accountFormat: z.string(),
      consumerKey: z.string(),
      consumerSecret: z.string(),
      mode: z.enum(['sandbox', 'live']),
      testPhone: z.string(),
      testAmount: z.string(),
    }).parse(req.body);

    // A submitted masked placeholder means the admin left the field untouched:
    // keep the previously stored credential instead of overwriting it with the
    // mask. Any other value (including '') is written as-is.
    const existing = await appPrisma.pushPaymentSettings.findUnique({ where: { id: 'default' } });
    const consumerKey = data.consumerKey === MASKED_PLACEHOLDER ? (existing?.consumerKey ?? '') : data.consumerKey;
    const consumerSecret = data.consumerSecret === MASKED_PLACEHOLDER ? (existing?.consumerSecret ?? '') : data.consumerSecret;

    const payload = {
      paybill: data.paybill,
      accountFormat: data.accountFormat,
      consumerKey,
      consumerSecret,
      mode: data.mode,
      testPhone: data.testPhone,
      testAmount: data.testAmount,
    };
    const row = await appPrisma.pushPaymentSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...payload },
      update: payload,
    });
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
  } catch (e) { next(e); }
});

// ---------- Trash & Audit Log ----------

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { entity, action, from, to, actor } = req.query as Record<string, string | undefined>;
    res.json(await listAuditLogs({ entity, action, from, to, actor }));
  } catch (e) { next(e); }
});

// Current state of the record referenced by an audit log — powers the JSON diff
// modal in Trash & Audit (snapshot vs. now).
router.get('/audit-logs/:id/current', async (req, res, next) => {
  try {
    const log = await appPrisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) throw new HttpError(404, 'Audit log not found');
    res.json({ current: await loadCurrentRecord(log.entityName, log.entityId) });
  } catch (e) { next(e); }
});

// Bulk restore: one request restores every selected deleted record. Independent
// per-row failures are reported back rather than aborting the whole batch.
router.post('/audit-logs/restore-bulk', async (req: AuthRequest, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    const actor = await resolveActor(req.user!.id);
    res.json(await restoreMany(ids, actor));
  } catch (e) { next(e); }
});

router.post('/audit-logs/:id/restore', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await restoreFromLog(req.params.id, actor);
    res.json({ message: 'Record restored successfully' });
  } catch (e) { next(e); }
});

// ---------- Backup, Export & Diagnostics ----------

// Manual backup trigger — support / admin can snapshot on demand.
router.post('/backup', async (_req, res, next) => {
  try {
    const info = await backupDatabase();
    res.json({ file: info.file, sizeBytes: info.size, at: info.at.toISOString() });
  } catch (e) { next(e); }
});

// Full parish data export (the exit path): every table as one JSON document,
// secrets stripped and M-Pesa credentials masked.
router.get('/export', async (_req, res, next) => {
  try {
    res.json(await exportAllData());
  } catch (e) { next(e); }
});

// Destructive full import: replaces the entire database. Super admin only, and
// requires an explicit `{ confirm: true }` to guard against accidental wipes.
router.post('/import', requireSuperAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { confirm, bundle } = z
      .object({ confirm: z.literal(true), bundle: z.unknown() })
      .parse(req.body);
    const count = await importAllData(bundle as ExportBundle);
    res.json({ message: `Import complete: ${count} records restored.` });
  } catch (e) { next(e); }
});

// Support diagnostics — health snapshot without secrets.
router.get('/diagnostics', async (_req, res, next) => {
  try {
    res.json(await collectDiagnostics());
  } catch (e) { next(e); }
});

export default router;
