import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/summary', async (_req, res, next) => {
  try {
    const [
      activeMembers,
      totalChristians,
      depositsAgg,
      expensesAgg,
      pendingCreditors,
      outstandingDebtors,
      totalEmployees,
      recentDeposits,
      recentExpenses,
      allItems,
    ] = await Promise.all([
      prisma.christian.count({ where: { status: 'Active' } }),
      prisma.christian.count(),
      prisma.deposit.aggregate({ _sum: { amount: true } }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.creditor.count({ where: { status: { in: ['Pending', 'Overdue', 'Scheduled'] } } }),
      prisma.debtor.count({ where: { status: { in: ['Outstanding', 'Partially Paid'] } } }),
      prisma.employee.count(),
      prisma.deposit.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.expense.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.inventoryItem.findMany(),
    ]);

    const lowStockItems = allItems.filter((i) => i.stock <= i.reorder).length;

    res.json({
      activeMembers,
      totalChristians,
      totalDeposits: depositsAgg._sum.amount ?? 0,
      totalExpenses: expensesAgg._sum.amount ?? 0,
      pendingCreditors,
      outstandingDebtors,
      lowStockItems,
      totalEmployees,
      recentDeposits,
      recentExpenses,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
