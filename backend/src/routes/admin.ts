import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';

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

router.get('/rights', async (_req, res, next) => {
  try {
    let row = await prisma.panelPermissions.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await prisma.panelPermissions.create({
        data: { id: 'default', panels: defaultPanels, actions: defaultActions },
      });
    }
    res.json({ panels: row.panels, actions: row.actions });
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

    const row = await prisma.panelPermissions.upsert({
      where: { id: 'default' },
      create: { id: 'default', panels: data.panels, actions: data.actions },
      update: { panels: data.panels, actions: data.actions },
    });
    res.json({ panels: row.panels, actions: row.actions });
  } catch (e) { next(e); }
});

router.get('/push-payments', async (_req, res, next) => {
  try {
    let row = await prisma.pushPaymentSettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await prisma.pushPaymentSettings.create({ data: { id: 'default' } });
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

    const row = await prisma.pushPaymentSettings.upsert({
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

export default router;
