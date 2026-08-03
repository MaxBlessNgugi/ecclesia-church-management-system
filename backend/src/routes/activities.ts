import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Contributions ──
router.get('/contributions', async (_req, res, next) => {
  try {
    const rows = await prisma.contribution.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(
      rows.map((r) => ({
        id: r.id,
        christianId: r.christianId,
        memberName: r.memberName,
        regNo: r.regNo,
        categories: parseJson<string[]>(r.categories, []),
        otherCategory: r.otherCategory ?? undefined,
        monthlyTracker: parseJson<Record<string, boolean>>(r.monthlyTracker, {}),
        amountKES: r.amountKES,
        date: r.date,
      }))
    );
  } catch (e) {
    next(e);
  }
});

router.post('/contributions', async (req, res, next) => {
  try {
    const data = z
      .object({
        christianId: z.string(),
        memberName: z.string(),
        regNo: z.string(),
        categories: z.array(z.string()),
        otherCategory: z.string().optional(),
        monthlyTracker: z.record(z.boolean()),
        amountKES: z.number(),
        date: z.string(),
      })
      .parse(req.body);

    const created = await prisma.contribution.create({
      data: {
        christianId: data.christianId,
        memberName: data.memberName,
        regNo: data.regNo,
        categories: JSON.stringify(data.categories),
        otherCategory: data.otherCategory ?? null,
        monthlyTracker: JSON.stringify(data.monthlyTracker),
        amountKES: data.amountKES,
        date: data.date,
      },
    });

    res.status(201).json({
      id: created.id,
      christianId: created.christianId,
      memberName: created.memberName,
      regNo: created.regNo,
      categories: data.categories,
      otherCategory: data.otherCategory,
      monthlyTracker: data.monthlyTracker,
      amountKES: created.amountKES,
      date: created.date,
    });
  } catch (e) {
    next(e);
  }
});

// ── Transfers ──
router.get('/transfers', async (_req, res, next) => {
  try {
    const rows = await prisma.transfer.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/transfers', async (req, res, next) => {
  try {
    const data = z
      .object({
        christianId: z.string(),
        memberName: z.string(),
        diocese: z.string(),
        parish: z.string(),
        localChurch: z.string(),
        scc: z.string(),
        date: z.string(),
      })
      .parse(req.body);

    const created = await prisma.transfer.create({ data });
    await prisma.christian.update({
      where: { id: data.christianId },
      data: {
        status: 'Transferred',
        diocese: data.diocese,
        parish: data.parish,
        localChurch: data.localChurch,
        scc: data.scc,
      },
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

// ── Billed Items ──
router.get('/billed-items', async (_req, res, next) => {
  try {
    const rows = await prisma.billedItem.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(
      rows.map((r) => ({
        id: r.id,
        christianId: r.christianId ?? undefined,
        memberName: r.memberName,
        isWalkIn: r.isWalkIn,
        category: r.category,
        item: r.item,
        unitFee: r.unitFee,
        quantity: r.quantity,
        totalAmount: r.totalAmount,
        date: r.date,
      }))
    );
  } catch (e) {
    next(e);
  }
});

router.post('/billed-items', async (req, res, next) => {
  try {
    const data = z
      .object({
        christianId: z.string().optional(),
        memberName: z.string(),
        isWalkIn: z.boolean().default(false),
        category: z.string(),
        item: z.string(),
        unitFee: z.number(),
        quantity: z.number().int().positive(),
        totalAmount: z.number(),
        date: z.string(),
      })
      .parse(req.body);

    const created = await prisma.billedItem.create({
      data: {
        christianId: data.christianId ?? null,
        memberName: data.memberName,
        isWalkIn: data.isWalkIn,
        category: data.category,
        item: data.item,
        unitFee: data.unitFee,
        quantity: data.quantity,
        totalAmount: data.totalAmount,
        date: data.date,
      },
    });

    res.status(201).json({
      id: created.id,
      christianId: created.christianId ?? undefined,
      memberName: created.memberName,
      isWalkIn: created.isWalkIn,
      category: created.category,
      item: created.item,
      unitFee: created.unitFee,
      quantity: created.quantity,
      totalAmount: created.totalAmount,
      date: created.date,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
