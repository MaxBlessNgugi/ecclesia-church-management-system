// =============================================================================
// Finance routes — mounted at /api (all require JWT auth)
// -----------------------------------------------------------------------------
//   GET/POST /deposits          bank deposits; refNo auto-generated (DEP-#####)
//                               when the client omits one.
//   GET/POST/PUT /creditors     amounts owed to suppliers; PATCH :id/paid marks
//                               a creditor Paid.
//   GET/POST /debtors           amounts owed by members; POST :id/payments
//                               reduces the balance and derives the status
//                               (Paid when it reaches 0, else Partially Paid).
//   GET/POST /expenses          spend records; voucherNo auto-generated (EXP-#####).
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';

const router = Router();
router.use(requireAuth);
router.use(requireModule('finance'));

// Deposits
router.get('/deposits', async (_req, res, next) => {
  try {
    res.json(await appPrisma.deposit.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

async function nextDepositRefNo(): Promise<string> {
  const last = await appPrisma.deposit.findFirst({ orderBy: { refNo: 'desc' } });
  const match = last?.refNo?.match(/(\d+)$/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `DEP-${String(next).padStart(5, '0')}`;
}

router.post('/deposits', async (req, res, next) => {
  try {
    const data = z.object({
      date: z.string(),
      amount: z.number().positive(),
      bankName: z.string(),
      accountNo: z.string(),
      sourceOfCash: z.string(),
      refNo: z.string().optional(),
      depositedBy: z.string(),
    }).parse(req.body);
    const created = await appPrisma.deposit.create({
      data: {
        ...data,
        refNo: data.refNo && data.refNo.trim() ? data.refNo : await nextDepositRefNo(),
      },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Creditors
router.get('/creditors', async (_req, res, next) => {
  try {
    res.json(await appPrisma.creditor.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/creditors', async (req, res, next) => {
  try {
    const data = z.object({
      vendor: z.string(),
      description: z.string(),
      invoiceNo: z.string(),
      amountOwed: z.number().positive(),
      dueDate: z.string(),
      status: z.enum(['Pending', 'Overdue', 'Scheduled', 'Paid']).optional(),
    }).parse(req.body);
    const created = await appPrisma.creditor.create({
      data: { ...data, status: data.status ?? 'Pending' },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.put('/creditors/:id', async (req, res, next) => {
  try {
    const data = z.object({
      vendor: z.string().optional(),
      description: z.string().optional(),
      invoiceNo: z.string().optional(),
      amountOwed: z.number().optional(),
      dueDate: z.string().optional(),
      status: z.enum(['Pending', 'Overdue', 'Scheduled', 'Paid']).optional(),
    }).parse(req.body);
    const updated = await appPrisma.creditor.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (e) { next(e); }
});

router.patch('/creditors/:id/paid', async (req, res, next) => {
  try {
    const updated = await appPrisma.creditor.update({
      where: { id: req.params.id },
      data: { status: 'Paid' },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Debtors
router.get('/debtors', async (_req, res, next) => {
  try {
    res.json(await appPrisma.debtor.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/debtors', async (req, res, next) => {
  try {
    const data = z.object({
      memberName: z.string(),
      contributionType: z.string(),
      amount: z.number().positive(),
      status: z.enum(['Outstanding', 'Partially Paid', 'Paid']).optional(),
    }).parse(req.body);
    const created = await appPrisma.debtor.create({
      data: { ...data, status: data.status ?? 'Outstanding' },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.post('/debtors/:id/payments', async (req, res, next) => {
  try {
    const { amountPaid } = z.object({ amountPaid: z.number().positive() }).parse(req.body);
    const debtor = await appPrisma.debtor.findUnique({ where: { id: req.params.id } });
    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });

    const newAmount = Math.max(0, debtor.amount - amountPaid);
    const status = newAmount === 0 ? 'Paid' : 'Partially Paid';
    const updated = await appPrisma.debtor.update({
      where: { id: req.params.id },
      data: { amount: newAmount, status },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Expenses
router.get('/expenses', async (_req, res, next) => {
  try {
    res.json(await appPrisma.expense.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

async function nextExpenseVoucherNo(): Promise<string> {
  const last = await appPrisma.expense.findFirst({ orderBy: { voucherNo: 'desc' } });
  const match = last?.voucherNo?.match(/(\d+)$/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `EXP-${String(next).padStart(5, '0')}`;
}

router.post('/expenses', async (req, res, next) => {
  try {
    const data = z.object({
      date: z.string(),
      category: z.string(),
      description: z.string(),
      amount: z.number().positive(),
      paymentMethod: z.string(),
      voucherNo: z.string().optional(),
    }).parse(req.body);
    const created = await appPrisma.expense.create({
      data: {
        ...data,
        voucherNo: data.voucherNo && data.voucherNo.trim() ? data.voucherNo : await nextExpenseVoucherNo(),
      },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;
