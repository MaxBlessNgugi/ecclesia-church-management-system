import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Deposits
router.get('/deposits', async (_req, res, next) => {
  try {
    res.json(await prisma.deposit.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/deposits', async (req, res, next) => {
  try {
    const data = z.object({
      date: z.string(),
      amount: z.number().positive(),
      bankName: z.string(),
      accountNo: z.string(),
      sourceOfCash: z.string(),
      refNo: z.string(),
      depositedBy: z.string(),
    }).parse(req.body);
    const created = await prisma.deposit.create({ data });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Creditors
router.get('/creditors', async (_req, res, next) => {
  try {
    res.json(await prisma.creditor.findMany({ orderBy: { createdAt: 'desc' } }));
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
    const created = await prisma.creditor.create({
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
    const updated = await prisma.creditor.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (e) { next(e); }
});

router.patch('/creditors/:id/paid', async (req, res, next) => {
  try {
    const updated = await prisma.creditor.update({
      where: { id: req.params.id },
      data: { status: 'Paid' },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Debtors
router.get('/debtors', async (_req, res, next) => {
  try {
    res.json(await prisma.debtor.findMany({ orderBy: { createdAt: 'desc' } }));
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
    const created = await prisma.debtor.create({
      data: { ...data, status: data.status ?? 'Outstanding' },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.post('/debtors/:id/payments', async (req, res, next) => {
  try {
    const { amountPaid } = z.object({ amountPaid: z.number().positive() }).parse(req.body);
    const debtor = await prisma.debtor.findUnique({ where: { id: req.params.id } });
    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });

    const newAmount = Math.max(0, debtor.amount - amountPaid);
    const status = newAmount === 0 ? 'Paid' : 'Partially Paid';
    const updated = await prisma.debtor.update({
      where: { id: req.params.id },
      data: { amount: newAmount, status },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Expenses
router.get('/expenses', async (_req, res, next) => {
  try {
    res.json(await prisma.expense.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/expenses', async (req, res, next) => {
  try {
    const data = z.object({
      date: z.string(),
      category: z.string(),
      description: z.string(),
      amount: z.number().positive(),
      paymentMethod: z.string(),
      voucherNo: z.string(),
    }).parse(req.body);
    const created = await prisma.expense.create({ data });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;
