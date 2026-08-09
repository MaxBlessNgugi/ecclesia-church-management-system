// =============================================================================
// Settings routes — /api/settings (singleton global configuration)
// -----------------------------------------------------------------------------
//   GET  /     → return the single SystemSettings row (create-if-missing)
//   PATCH /    → partial update (parishName, diocese, setupCompleted, setupStep)
//
// Used by the frontend OnboardingView to store parish identity and flip the
// setupCompleted flag once the first-run wizard finishes.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const updateSchema = z.object({
  parishName: z.string().optional(),
  diocese: z.string().optional(),
  setupCompleted: z.boolean().optional(),
  setupStep: z.number().int().positive().optional(),
});

/**
 * GET /api/settings
 * Returns the singleton SystemSettings row. Creates a default row on first
 * call so the frontend always has something to render.
 */
router.get('/', async (_req, res, next) => {
  try {
    let settings = await appPrisma.systemSettings.findUnique({ where: { id: 'default' } });
    if (!settings) {
      settings = await appPrisma.systemSettings.create({ data: { id: 'default' } });
    }
    res.json(settings);
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/settings
 * Partial update of the singleton settings row.
 */
router.patch('/', async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const updated = await appPrisma.systemSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
