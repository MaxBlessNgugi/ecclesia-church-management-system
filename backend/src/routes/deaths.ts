import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const rows = await appPrisma.death.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = z.object({
      christianId: z.string(),
      memberName: z.string(),
      placeOfDeath: z.string(),
      dateOfDeath: z.string(),
      dateOfBurial: z.string(),
      ministerName: z.string(),
      remarks: z.string().default(''),
    }).parse(req.body);

    const created = await appPrisma.death.create({ data });
    await appPrisma.christian.update({
      where: { id: data.christianId },
      data: { status: 'Deceased' },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;
