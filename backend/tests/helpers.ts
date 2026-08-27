import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { signToken } from '../src/lib/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { decimalJson } from '../src/middleware/decimalJson.js';
import { prisma as appPrismaSingleton } from '../src/lib/prisma.js';

import authRoutes from '../src/routes/auth.js';
import christiansRoutes from '../src/routes/christians.js';
import activitiesRoutes from '../src/routes/activities.js';
import deathsRoutes from '../src/routes/deaths.js';
import financeRoutes from '../src/routes/finance.js';
import ledgersRoutes from '../src/routes/ledgers.js';
import inventoryRoutes from '../src/routes/inventory.js';
import hrRoutes from '../src/routes/hr.js';
import adminRoutes from '../src/routes/admin.js';
import reportsRoutes from '../src/routes/reports.js';
import dashboardRoutes from '../src/routes/dashboard.js';

export async function seedTestUser() {
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const user = await appPrismaSingleton.user.upsert({
    where: { email: 'admin@test.com' },
    update: {
      passwordHash,
      isActive: true,
      isDeleted: false,
      loginFailedAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'admin@test.com',
      passwordHash,
      name: 'Test Admin',
      role: 'super_admin',
      isActive: true,
    },
  });
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return { user, token };
}

export async function cleanupTestData() {
  const p = appPrismaSingleton;
  await p.contribution.deleteMany();
  await p.transfer.deleteMany();
  await p.billedItem.deleteMany();
  await p.death.deleteMany();
  await p.christian.deleteMany();
  await p.deposit.deleteMany();
  await p.creditor.deleteMany();
  await p.debtor.deleteMany();
  await p.expense.deleteMany();
  await p.ledgerMovement.deleteMany();
  await p.ledger.deleteMany();
  await p.sale.deleteMany();
  await p.stockTake.deleteMany();
  await p.stockIssue.deleteMany();
  await p.delivery.deleteMany();
  await p.inventoryItem.deleteMany();
  await p.payroll.deleteMany();
  await p.leave.deleteMany();
  await p.recruitmentApplicant.deleteMany();
  await p.recruitment.deleteMany();
  await p.employee.deleteMany();
  await p.auditLog.deleteMany();
  await p.user.deleteMany({ where: { email: { not: 'admin@test.com' } } });
}

export function createTestApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(decimalJson());

  app.get('/api/health', async (_req, res) => {
    try {
      await appPrismaSingleton.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', time: new Date().toISOString(), db: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/christians', christiansRoutes);
  app.use('/api', activitiesRoutes);
  app.use('/api/deaths', deathsRoutes);
  app.use('/api', financeRoutes);
  app.use('/api/ledgers', ledgersRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/hr', hrRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  app.use(errorHandler);
  return app;
}
