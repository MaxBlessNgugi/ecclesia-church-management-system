import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';

let app: Express;
let token: string;

beforeAll(async () => {
  app = createTestApp();
  const seeded = await seedTestUser();
  token = seeded.token;
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  token = seeded.token;
});

// =============================================================================
// DECIMAL PRECISION — Classic float bug tests
// =============================================================================

describe('Decimal Precision - Finance', () => {
  it('POST /api/deposits - 0.1 + 0.2 = 0.3 (classic float bug)', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: 0.1 + 0.2, // Should be exactly 0.30, not 0.30000000000000004
        bankName: 'KCB',
        accountNo: '123',
        sourceOfCash: 'Test',
        depositedBy: 'Test',
      });
    expect(res.status).toBe(201);
    // Decimal(12,2) stores 0.30 — verify no float drift
    expect(res.body.amount).toBe(0.3);
  });

  it('POST /api/deposits - large amount without precision loss', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: 99999999.99, // Max for DECIMAL(12,2) before overflow
        bankName: 'KCB',
        accountNo: '123',
        sourceOfCash: 'Test',
        depositedBy: 'Test',
      });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(99999999.99);
  });

  it('POST /api/deposits - rounding to 2 decimal places', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: 100.555, // Should round to 100.56 or 100.55
        bankName: 'KCB',
        accountNo: '123',
        sourceOfCash: 'Test',
        depositedBy: 'Test',
      });
    expect(res.status).toBe(201);
    // PostgreSQL DECIMAL rounds; verify no float artifacts
    expect(Number.isFinite(res.body.amount)).toBe(true);
    // Verify it's stored with at most 2 decimal places
    const parts = String(res.body.amount).split('.');
    expect(parts.length === 1 || parts[1].length <= 2).toBe(true);
  });

  it('POST /api/expenses - 0.1 + 0.2 precision', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        category: 'Utilities',
        description: 'Test',
        amount: 0.1 + 0.2,
        paymentMethod: 'Cash',
      });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(0.3);
  });

  it('POST /api/creditors - amountOwed precision', async () => {
    const res = await request(app)
      .post('/api/creditors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendor: 'Test',
        description: 'Test',
        invoiceNo: 'INV-001',
        amountOwed: 100.10 + 200.20, // Should be 300.30
        dueDate: '2024-07-01',
      });
    expect(res.status).toBe(201);
    expect(res.body.amountOwed).toBe(300.3);
  });
});

// =============================================================================
// DEBTOR PAYMENTS — Arithmetic with Decimal
// =============================================================================

describe('Decimal Precision - Debtor Payments', () => {
  it('partial payment preserves precision', async () => {
    const created = await request(app)
      .post('/api/debtors')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberName: 'Test', contributionType: 'Tithe', amount: 100.30 });

    const res = await request(app)
      .post(`/api/debtors/${created.body.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountPaid: 50.15 });

    expect(res.body.amount).toBe(50.15);
    expect(res.body.status).toBe('Partially Paid');
  });

  it('full payment results in zero balance', async () => {
    const created = await request(app)
      .post('/api/debtors')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberName: 'Test', contributionType: 'Tithe', amount: 100.30 });

    const res = await request(app)
      .post(`/api/debtors/${created.body.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountPaid: 100.30 });

    expect(res.body.amount).toBe(0);
    expect(res.body.status).toBe('Paid');
  });
});

// =============================================================================
// PAYROLL — Net pay computation with Decimal
// =============================================================================

describe('Decimal Precision - Payroll', () => {
  let employeeId: string;

  beforeEach(async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surname: 'Test',
        firstName: 'Employee',
        designation: 'Staff',
        hireDate: '2024-01-01',
        email: 'test@parish.org',
        phone: '+254700000000',
        nationalId: '11111111',
      });
    employeeId = created.body.id;
  });

  it('net pay = basic + allowances - deductions with decimal values', async () => {
    const res = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        period: '2024-06',
        basicSalary: 50000.50,
        allowances: 5000.75,
        deductions: 2000.25,
      });
    expect(res.status).toBe(201);
    // 50000.50 + 5000.75 - 2000.25 = 53001.00
    expect(res.body.netPay).toBe(53001);
  });

  it('zero allowances and deductions', async () => {
    const res = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        period: '2024-06',
        basicSalary: 40000,
      });
    expect(res.body.netPay).toBe(40000);
  });

  it('update payroll recomputes net pay', async () => {
    const created = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        period: '2024-06',
        basicSalary: 50000,
        allowances: 5000,
        deductions: 2000,
      });

    const res = await request(app)
      .put(`/api/hr/payrolls/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ basicSalary: 55000.50, allowances: 3000.50, deductions: 1000.25 });
    expect(res.status).toBe(200);
    // 55000.50 + 3000.50 - 1000.25 = 57000.75
    expect(res.body.netPay).toBe(57000.75);
  });
});

// =============================================================================
// LEDGER TRANSFERS — Balance arithmetic with Decimal
// =============================================================================

describe('Decimal Precision - Ledger Transfers', () => {
  let fromId: string;
  let toId: string;

  beforeEach(async () => {
    const c1 = await request(app)
      .post('/api/ledgers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cash', type: 'Cash', cashier: 'John', balance: 10000.50 });
    fromId = c1.body.id;

    const c2 = await request(app)
      .post('/api/ledgers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bank', type: 'Bank', cashier: 'Jane', balance: 5000.25 });
    toId = c2.body.id;
  });

  it('transfer preserves decimal precision in balances', async () => {
    const res = await request(app)
      .post('/api/ledgers/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ fromLedgerId: fromId, toLedgerId: toId, amount: 1234.56 });

    expect(res.status).toBe(201);

    // Check updated balances
    const ledgers = await request(app)
      .get('/api/ledgers')
      .set('Authorization', `Bearer ${token}`);

    const from = ledgers.body.find((l: any) => l.id === fromId);
    const to = ledgers.body.find((l: any) => l.id === toId);

    // 10000.50 - 1234.56 = 8765.94
    expect(from.balance).toBe(8765.94);
    // 5000.25 + 1234.56 = 6234.81
    expect(to.balance).toBe(6234.81);
  });
});

// =============================================================================
// BILLED ITEMS — Unit fee × quantity with Decimal
// =============================================================================

describe('Decimal Precision - Billed Items', () => {
  it('decimal unitFee × quantity', async () => {
    const res = await request(app)
      .post('/api/billed-items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberName: 'Test',
        isWalkIn: true,
        category: 'Services',
        item: 'Hall Rental',
        unitFee: 1500.75,
        quantity: 3,
        totalAmount: 1500.75 * 3, // 4502.25
        date: '2024-06-15',
      });
    expect(res.status).toBe(201);
    expect(res.body.unitFee).toBe(1500.75);
    expect(res.body.totalAmount).toBe(4502.25);
  });
});
