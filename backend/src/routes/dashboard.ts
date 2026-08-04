import { Router } from 'express';
import { appPrisma } from '../lib/prisma.js';
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
      appPrisma.christian.count({ where: { status: 'Active' } }),
      appPrisma.christian.count(),
      appPrisma.deposit.aggregate({ _sum: { amount: true } }),
      appPrisma.expense.aggregate({ _sum: { amount: true } }),
      appPrisma.creditor.count({ where: { status: { in: ['Pending', 'Overdue', 'Scheduled'] } } }),
      appPrisma.debtor.count({ where: { status: { in: ['Outstanding', 'Partially Paid'] } } }),
      appPrisma.employee.count(),
      appPrisma.deposit.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      appPrisma.expense.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      appPrisma.inventoryItem.findMany(),
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
