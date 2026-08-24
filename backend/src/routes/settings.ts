// =============================================================================
// Parish settings routes — mounted at both /api/parish and /api/settings
//
//   GET  /api/parish      → return the single ParishSettings row
//   PUT  /api/parish      → full or partial update (admin + super_admin only)
//
// The same router is also mounted at /api/settings for backward compat.
// =============================================================================
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Zod schema for PUT /api/parish — all fields optional for partial updates.
const updateSchema = z.object({
  name: z.string().optional(),
  diocese: z.string().optional(),
  localChurch: z.string().optional(),
  sccLabel: z.string().optional(),
  county: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  motto: z.string().optional(),
  logoData: z.string().nullable().optional(),
  setupCompleted: z.boolean().optional(),
});

/**
 * Ensure the singleton row exists. Called lazily on GET.
 */
async function ensureSingleton() {
  let settings = await appPrisma.parishSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await appPrisma.parishSettings.create({ data: { id: 'default' } });
  }
  return settings;
}

/**
 * GET /
 * Returns the singleton ParishSettings row (created on first call).
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await ensureSingleton();
    res.json(settings);
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /
 * Full or partial update of the singleton parish settings.
 * Only admin and super_admin users may update.
 */
router.put('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Authorization: only admin or super_admin
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can update parish settings.' });
    }

    const data = updateSchema.parse(req.body);
    const updated = await appPrisma.parishSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH / (backward-compat alias for PUT /)
 * Accepts old field names (parishName → name) and new ones.
 */
router.patch('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can update parish settings.' });
    }

    // Map old field names to new ones
    const mapped: Record<string, unknown> = {};
    if ('parishName' in req.body) mapped.name = req.body.parishName;
    if ('diocese' in req.body) mapped.diocese = req.body.diocese;
    if ('setupCompleted' in req.body) mapped.setupCompleted = req.body.setupCompleted;
    if ('setupStep' in req.body) { /* drop old field */ }
    // Pass through any new fields
    for (const key of ['name', 'localChurch', 'sccLabel', 'county', 'country', 'address', 'phone', 'email', 'motto', 'logoData']) {
      if (key in req.body) mapped[key] = req.body[key];
    }

    if (Object.keys(mapped).length === 0) {
      return res.json(await ensureSingleton());
    }

    const updated = await appPrisma.parishSettings.upsert({
      where: { id: 'default' },
      update: mapped,
      create: { id: 'default', ...mapped },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
