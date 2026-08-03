import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function parseOptionalJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return undefined;
  }
}

router.get('/sacraments', async (req, res, next) => {
  try {
    const { sacramentType, localChurch, scc } = req.query as Record<string, string | undefined>;
    const where: any = { status: { not: 'Inactive' } };
    if (localChurch) where.localChurch = localChurch;
    if (scc) where.scc = scc;

    const rows = await prisma.christian.findMany({ where });
    const result = rows.map((c) => {
      let date = '';
      const baptism = parseOptionalJson<any>(c.baptism);
      const eucharist = parseOptionalJson<any>(c.eucharist);
      const confirmation = parseOptionalJson<any>(c.confirmation);
      const marriage = parseOptionalJson<any>(c.marriage);
      if (sacramentType === 'baptism' && baptism) date = baptism.date ?? '';
      else if (sacramentType === 'eucharist' && eucharist) date = eucharist.date ?? '';
      else if (sacramentType === 'confirmation' && confirmation) date = confirmation.date ?? '';
      else if (sacramentType === 'marriage' && marriage) date = marriage.date ?? '';
      return {
        name: `${c.baptismalName} ${c.secondName} ${c.sirName}`.trim(),
        dob: '',
        date,
        scc: c.scc,
        status: c.status,
      };
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/contributions', async (req, res, next) => {
  try {
    const { category, month } = req.query as Record<string, string | undefined>;
    const rows = await prisma.contribution.findMany({ orderBy: { createdAt: 'desc' } });
    let result = rows.map((r) => {
      let categories: string[] = [];
      let tracker: Record<string, boolean> = {};
      try { categories = JSON.parse(r.categories); } catch { }
      try { tracker = JSON.parse(r.monthlyTracker); } catch { }
      return {
        memberName: r.memberName,
        category: categories.join(', '),
        month: month ?? '',
        amount: r.amountKES,
        status: month && tracker[month] ? 'Paid' : 'Pending',
      };
    });
    if (category) {
      result = result.filter((r) => r.category.toLowerCase().includes(category.toLowerCase()));
    }
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/sales', async (req, res, next) => {
  try {
    const { item, date } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (item) where.item = { contains: item };
    if (date) where.time = { startsWith: date };
    const rows = await prisma.sale.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(rows.map((r) => ({
      item: r.item,
      quantity: 1,
      amount: r.amount,
      date: r.time,
    })));
  } catch (e) { next(e); }
});

router.get('/cashiers', async (_req, res, next) => {
  try {
    const ledgers = await prisma.ledger.findMany();
    const result = ledgers.map((l) => ({
      cashier: l.cashier,
      sessions: 1,
      collected: l.balance,
      reconciled: l.balance,
      status: 'OK',
    }));
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
