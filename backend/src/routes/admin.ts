import { Router } from 'express';
import { z } from 'zod';
import { appPrisma, prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';
import { requireAdmin, requireAuth, AuthRequest } from '../middleware/auth.js';
import { softDelete, restoreFromLog, listAuditLogs, resolveActor } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

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
      data: { email: data.email, passwordHash, name: data.name, title: data.title ?? null, role: data.role },
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
      consumerKey: row.consumerKey,
      consumerSecret: row.consumerSecret,
      testPhone: row.testPhone,
      testAmount: row.testAmount,
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
      testPhone: z.string(),
      testAmount: z.string(),
    }).parse(req.body);

    const row = await appPrisma.pushPaymentSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    res.json({
      paybill: row.paybill,
      accountFormat: row.accountFormat,
      consumerKey: row.consumerKey,
      consumerSecret: row.consumerSecret,
      testPhone: row.testPhone,
      testAmount: row.testAmount,
    });
  } catch (e) { next(e); }
});

// ---------- Trash & Audit Log ----------

router.get('/audit-logs', async (req, res, next) => {
  try {
    const entity = req.query.entity as string | undefined;
    const action = req.query.action as string | undefined;
    res.json(await listAuditLogs({ entity, action }));
  } catch (e) { next(e); }
});

router.post('/audit-logs/:id/restore', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await restoreFromLog(req.params.id, actor);
    res.json({ message: 'Record restored successfully' });
  } catch (e) { next(e); }
});

export default router;
