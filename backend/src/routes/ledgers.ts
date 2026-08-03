import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    res.json(await prisma.ledger.findMany({ orderBy: { code: 'asc' } }));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string(),
      code: z.string().optional(),
      type: z.string(),
      cashier: z.string(),
      balance: z.number().default(0),
    }).parse(req.body);
    const count = await prisma.ledger.count();
    const code = data.code && data.code.length > 0 ? data.code : `LDR-${String(count + 1).padStart(3, '0')}`;
    const created = await prisma.ledger.create({ data: { ...data, code } });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.get('/movements', async (_req, res, next) => {
  try {
    res.json(await prisma.ledgerMovement.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/transfer', async (req, res, next) => {
  try {
    const { fromLedgerId, toLedgerId, amount, notes } = z.object({
      fromLedgerId: z.string(),
      toLedgerId: z.string(),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }).parse(req.body);

    const from = await prisma.ledger.findUnique({ where: { id: fromLedgerId } });
    const to = await prisma.ledger.findUnique({ where: { id: toLedgerId } });
    if (!from || !to) return res.status(404).json({ error: 'Ledger not found' });
    if (from.balance < amount) {
      return res.status(422).json({ error: 'Insufficient balance in source ledger' });
    }

    const time = new Date().toISOString();
    const [movement] = await prisma.$transaction([
      prisma.ledger.update({
        where: { id: fromLedgerId },
        data: { balance: { decrement: amount } },
      }),
      prisma.ledger.update({
        where: { id: toLedgerId },
        data: { balance: { increment: amount } },
      }),
      prisma.ledgerMovement.create({
        data: {
          amount,
          time,
          from: from.name,
          to: to.name,
          notes: notes ?? null,
        },
      }),
    ]);

    // movement is the last result
    const mov = await prisma.ledgerMovement.findFirst({ orderBy: { createdAt: 'desc' } });
    res.status(201).json(mov);
  } catch (e) { next(e); }
});

export default router;
