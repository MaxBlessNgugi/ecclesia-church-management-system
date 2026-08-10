// =============================================================================
// SMS routes — /api/sms (require JWT + admin role)
// -----------------------------------------------------------------------------
//   GET  /settings        → masked SmsSettings singleton
//   PATCH /settings       → update SmsSettings (apiKey may be masked placeholder)
//   POST /send            → { to: string[], message: string } → sendSms result
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import { sendSms, maskApiKey } from '../lib/sms.js';

const router = Router();

const MASKED_PLACEHOLDER = '••••••••••••••••';

router.use(requireAuth);
router.use(requireAdmin);

// GET /api/sms/settings — return masked SMS settings
router.get('/settings', async (_req, res, next) => {
  try {
    let row = await appPrisma.smsSettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await appPrisma.smsSettings.create({ data: { id: 'default' } });
    }
    res.json({
      enabled: row.enabled,
      username: row.username,
      apiKey: maskApiKey(row.apiKey),
      senderId: row.senderId,
      hasApiKey: Boolean(row.apiKey),
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/sms/settings — update SMS settings
router.patch('/settings', async (req, res, next) => {
  try {
    const data = z.object({
      enabled: z.boolean().optional(),
      username: z.string().optional(),
      apiKey: z.string(),
      senderId: z.string().optional(),
    }).parse(req.body);

    const existing = await appPrisma.smsSettings.findUnique({ where: { id: 'default' } });
    const apiKey = data.apiKey === MASKED_PLACEHOLDER ? (existing?.apiKey ?? '') : data.apiKey;

    const row = await appPrisma.smsSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data, apiKey },
      update: { enabled: data.enabled, username: data.username, apiKey, senderId: data.senderId },
    });

    res.json({
      enabled: row.enabled,
      username: row.username,
      apiKey: maskApiKey(row.apiKey),
      senderId: row.senderId,
      hasApiKey: Boolean(row.apiKey),
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/sms/send — send an SMS message
router.post('/send', async (req, res, next) => {
  try {
    const { to, message } = z.object({
      to: z.union([z.string(), z.array(z.string())]),
      message: z.string().min(1),
    }).parse(req.body);

    const result = await sendSms(to, message);
    res.json(result);
  } catch (e: any) {
    if (e?.message?.includes('not configured')) {
      res.status(400).json({ success: false, error: e.message });
    } else {
      next(e);
    }
  }
});

export default router;
