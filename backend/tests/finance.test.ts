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

describe('Finance - Deposits', () => {
  it('POST /api/deposits - creates deposit with auto refNo', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: 100000,
        bankName: 'KCB',
        accountNo: '1234567890',
        sourceOfCash: 'Sunday Collection',
        depositedBy: 'John',
      });
    expect(res.status).toBe(201);
    expect(res.body.refNo).toMatch(/^DEP-\d{5}$/);
    expect(res.body.amount).toBe(100000);
  });

  it('POST /api/deposits - uses provided refNo', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: 50000,
        bankName: 'Equity',
        accountNo: '9876543210',
        sourceOfCash: 'Fundraiser',
        refNo: 'CUSTOM-REF',
        depositedBy: 'Jane',
      });
    expect(res.body.refNo).toBe('CUSTOM-REF');
  });

  it('GET /api/deposits - lists deposits', async () => {
    await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: 10000,
        bankName: 'KCB',
        accountNo: '123',
        sourceOfCash: 'Collection',
        depositedBy: 'John',
      });

    const res = await request(app)
      .get('/api/deposits')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('Finance - Creditors', () => {
  it('POST /api/creditors - creates creditor', async () => {
    const res = await request(app)
      .post('/api/creditors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendor: 'Building Supplies Ltd',
        description: 'Cement and steel',
        invoiceNo: 'INV-001',
        amountOwed: 250000,
        dueDate: '2024-07-15',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
  });

  it('PATCH /api/creditors/:id/paid - marks creditor paid', async () => {
    const created = await request(app)
      .post('/api/creditors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendor: 'Supplier',
        description: 'Goods',
        invoiceNo: 'INV-002',
        amountOwed: 50000,
        dueDate: '2024-07-01',
      });

    const res = await request(app)
      .patch(`/api/creditors/${created.body.id}/paid`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.status).toBe('Paid');
  });
});

describe('Finance - Debtors', () => {
  it('POST /api/debtors - creates debtor', async () => {
    const res = await request(app)
      .post('/api/debtors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberName: 'Peter Kamau',
        contributionType: 'Tithe',
        amount: 10000,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Outstanding');
  });

  it('POST /api/debtors/:id/payments - partial payment', async () => {
    const created = await request(app)
      .post('/api/debtors')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberName: 'Peter', contributionType: 'Tithe', amount: 10000 });

    const res = await request(app)
      .post(`/api/debtors/${created.body.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountPaid: 3000 });
    expect(res.body.amount).toBe(7000);
    expect(res.body.status).toBe('Partially Paid');
  });

  it('POST /api/debtors/:id/payments - full payment', async () => {
    const created = await request(app)
      .post('/api/debtors')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberName: 'Peter', contributionType: 'Tithe', amount: 10000 });

    const res = await request(app)
      .post(`/api/debtors/${created.body.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountPaid: 10000 });
    expect(res.body.amount).toBe(0);
    expect(res.body.status).toBe('Paid');
  });
});

describe('Finance - Expenses', () => {
  it('POST /api/expenses - creates expense with auto voucherNo', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        category: 'Utilities',
        description: 'Electricity bill',
        amount: 5000,
        paymentMethod: 'M-Pesa',
      });
    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toMatch(/^EXP-\d{5}$/);
  });
});

describe('Finance - Validation', () => {
  it('POST /api/deposits - negative amount rejected', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-15',
        amount: -100,
        bankName: 'KCB',
        accountNo: '123',
        sourceOfCash: 'Test',
        depositedBy: 'Test',
      });
    expect(res.status).toBe(400);
  });

  it('POST /api/deposits - missing required field rejected', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000 });
    expect(res.status).toBe(400);
  });

  it('No auth - returns 401', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .send({ date: '2024-01-01', amount: 100, bankName: 'KCB', accountNo: '1', sourceOfCash: 'Test', depositedBy: 'Test' });
    expect(res.status).toBe(401);
  });
});
