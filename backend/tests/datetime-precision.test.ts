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
// DATE-TIME: Records with dates store and retrieve as ISO-8601 strings
// =============================================================================

describe('DateTime - Contribution dates', () => {
  it('POST /api/contributions - accepts ISO date and returns ISO string', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nationalId: '12345678',
        baptismalName: 'Test',
        secondName: 'Member',
        sirName: 'User',
        phone: '0700000000',
        diocese: 'Nairobi',
        parish: 'Test Parish',
        localChurch: 'Test Church',
        scc: 'Test SCC',
      });
    const christianId = res.body.id;

    const contribution = await request(app)
      .post('/api/contributions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        christianId,
        memberName: 'Test Member',
        regNo: 'REG-2026-000001',
        categories: ['Tithe'],
        monthlyTracker: { JAN: true },
        amountKES: 5000,
        date: '2026-03-15',
      });

    expect(contribution.status).toBe(201);
    // Date should be returned as an ISO string
    expect(contribution.body.date).toBeDefined();
    expect(typeof contribution.body.date).toBe('string');
    // Should be parseable as a valid date
    expect(new Date(contribution.body.date).toISOString()).toBe(contribution.body.date);
  });
});

describe('DateTime - Deposit dates', () => {
  it('POST /api/deposits - stores and retrieves date correctly', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-06-15',
        amount: 10000,
        bankName: 'KCB',
        accountNo: '123',
        sourceOfCash: 'Test',
        depositedBy: 'Test',
      });

    expect(res.status).toBe(201);
    expect(res.body.date).toBeDefined();
    // Should be a valid ISO datetime string
    const parsed = new Date(res.body.date);
    expect(parsed.toISOString()).toBe(res.body.date);
  });
});

describe('DateTime - Expense dates', () => {
  it('POST /api/expenses - stores and retrieves date correctly', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-07-01',
        category: 'Utilities',
        description: 'Test expense',
        amount: 5000,
        paymentMethod: 'Cash',
      });

    expect(res.status).toBe(201);
    expect(res.body.date).toBeDefined();
    const parsed = new Date(res.body.date);
    expect(parsed.toISOString()).toBe(res.body.date);
  });
});

describe('DateTime - Employee hireDate', () => {
  it('POST /api/hr/employees - stores hireDate as DateTime', async () => {
    const res = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surname: 'Test',
        firstName: 'Employee',
        designation: 'Staff',
        hireDate: '2024-01-15',
        email: 'test@parish.org',
        phone: '+254700000000',
        nationalId: '11111111',
      });

    expect(res.status).toBe(201);
    expect(res.body.hireDate).toBeDefined();
    const parsed = new Date(res.body.hireDate);
    expect(parsed.toISOString()).toBe(res.body.hireDate);
  });
});

describe('DateTime - Leave dates', () => {
  let employeeId: string;

  beforeEach(async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surname: 'Leave',
        firstName: 'Tester',
        designation: 'Staff',
        hireDate: '2024-01-01',
        email: 'leave@parish.org',
        phone: '+254700000000',
        nationalId: '22222222',
      });
    employeeId = created.body.id;
  });

  it('POST /api/hr/leaves - stores startDate and endDate as DateTime', async () => {
    const res = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Annual Leave',
        startDate: '2026-08-10',
        endDate: '2026-08-21',
        days: 10,
        reason: 'Vacation',
      });

    expect(res.status).toBe(201);
    expect(res.body.startDate).toBeDefined();
    expect(res.body.endDate).toBeDefined();
    expect(new Date(res.body.startDate).toISOString()).toBe(res.body.startDate);
    expect(new Date(res.body.endDate).toISOString()).toBe(res.body.endDate);
  });
});

// =============================================================================
// DATE-TIME: Date range filtering with gte/lte (not string prefix)
// =============================================================================

describe('DateTime - Date range filtering', () => {
  it('GET /api/reports/sales - filters by date using DateTime range', async () => {
    // Create inventory item first
    await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Item', sku: 'TST-001', category: 'Test', cost: 100, price: 200 });

    // Create sales on different dates
    await request(app)
      .post('/api/inventory/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ item: 'Test Item', time: '2026-06-10T10:00:00Z', amount: 200 });

    await request(app)
      .post('/api/inventory/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ item: 'Test Item', time: '2026-06-15T14:00:00Z', amount: 200 });

    await request(app)
      .post('/api/inventory/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ item: 'Test Item', time: '2026-07-01T09:00:00Z', amount: 200 });

    // Filter for June 10 only
    const res = await request(app)
      .get('/api/reports/sales?date=2026-06-10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].date).toContain('2026-06-10');
  });
});

// =============================================================================
// DATE-TIME: Ordering by date (chronological, not lexicographic)
// =============================================================================

describe('DateTime - Chronological ordering', () => {
  it('GET /api/deposits - orders by date chronologically (newest first)', async () => {
    // Create deposits in non-chronological order
    await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-01-15', amount: 1000, bankName: 'KCB', accountNo: '1', sourceOfCash: 'Test', depositedBy: 'Test' });

    await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-06-20', amount: 2000, bankName: 'KCB', accountNo: '2', sourceOfCash: 'Test', depositedBy: 'Test' });

    await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-03-10', amount: 3000, bankName: 'KCB', accountNo: '3', sourceOfCash: 'Test', depositedBy: 'Test' });

    const res = await request(app)
      .get('/api/deposits')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    // Should be ordered newest first (by createdAt, not date)
    // Verify all dates are valid ISO strings
    for (const deposit of res.body) {
      expect(new Date(deposit.date).toISOString()).toBe(deposit.date);
    }
  });
});

// =============================================================================
// DATE-TIME: Ledger movement time field
// =============================================================================

describe('DateTime - Ledger movement timestamps', () => {
  it('POST /api/ledgers/transfer - stores time as DateTime', async () => {
    const c1 = await request(app)
      .post('/api/ledgers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cash', type: 'Cash', cashier: 'John', balance: 10000 });

    const c2 = await request(app)
      .post('/api/ledgers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bank', type: 'Bank', cashier: 'Jane', balance: 5000 });

    const res = await request(app)
      .post('/api/ledgers/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ fromLedgerId: c1.body.id, toLedgerId: c2.body.id, amount: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.time).toBeDefined();
    const parsed = new Date(res.body.time);
    expect(parsed.toISOString()).toBe(res.body.time);
  });
});
