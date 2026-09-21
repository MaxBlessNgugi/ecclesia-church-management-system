/**
 * Concurrency / deadlock regression tests — Ecclesia backend
 *
 * Forensic context (2026-09-21 remediation):
 *   The primary mechanisms (no SERIALIZABLE needed anywhere):
 *     - expenses/deposits: gapless reference numbers via an atomic counter row
 *       (INSERT … ON CONFLICT DO UPDATE … RETURNING) inside the create
 *       transaction + UNIQUE index backstop → distinct refs, no deadlocks.
 *     - sales: single guarded atomic decrement (WHERE stock >= 1) + sale insert
 *       in ONE transaction → oversell impossible, single-row locks, failures
 *       are 422 business rules, never deadlocks.
 *     - ledger transfers: both balance rows written in one GLOBAL id order +
 *       guarded decrement → the A→B vs B→A lock-order cycle is structurally
 *       impossible; balances conserved exactly.
 *     - debtor payments: guarded atomic decrement → no lost updates.
 *   Secondary mechanism: bounded transient-only retry with jitter
 *   (lib/transient.ts) for residual 40P01/40001/P2034 conflicts.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { isTransientTransactionError, retryOnTransient } from '../src/lib/transient.js';
import { prisma } from '../src/lib/prisma.js';
import { toNum } from '../src/lib/decimal.js';

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

const auth = () => ({ Authorization: `Bearer ${token}` });

/** Fires `n` concurrent POSTs and buckets the status codes. */
async function fireConcurrent(n: number, make: (i: number) => Promise<{ status: number; body: any }>) {
  const results = await Promise.all(Array.from({ length: n }, (_, i) => make(i).catch((e) => ({ status: 599, body: { message: String(e) } }))));
  const byStatus = new Map<number, number>();
  for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  return { results, byStatus };
}

// ---------------------------------------------------------------------------
// EXPENSES — 20 concurrent entries must ALL succeed with distinct vouchers
// ---------------------------------------------------------------------------
describe('Concurrency — expenses', () => {
  it.each([1, 5, 10, 20, 50])('matrix %i concurrent creates: all succeed, distinct sequential voucherNos', async (n) => {
    const { byStatus } = await fireConcurrent(n, (i) =>
      request(app).post('/api/expenses').set(auth()).send({
        date: '2026-09-21',
        category: `Cat-${i}`,
        description: `Concurrent expense ${i}`,
        amount: 100 + i,
        paymentMethod: 'Cash',
      }),
    );

    expect(byStatus.get(201)).toBe(n); // every operation succeeds
    expect(byStatus.get(500) ?? 0).toBe(0); // zero unexpected failures/deadlocks
    expect(byStatus.get(409) ?? 0).toBe(0);

    const rows = await prisma.expense.findMany({ orderBy: { voucherNo: 'asc' } });
    expect(rows).toHaveLength(n);
    const nums = rows.map((r) => parseInt(r.voucherNo.match(/(\d+)$/)![1], 10));
    expect(new Set(rows.map((r) => r.voucherNo)).size).toBe(n); // no duplicates
    // The counter is monotonic across the suite (financial documents must
    // never reuse numbers), so assert gapless-sequential within this run:
    // strictly increasing by exactly 1.
    const deltas = nums.slice(1).map((v, i) => v - nums[i]);
    expect(deltas).toEqual(Array.from({ length: n - 1 }, () => 1));
  });
});

// ---------------------------------------------------------------------------
// DEPOSITS — same counter mechanism, 20 concurrent
// ---------------------------------------------------------------------------
describe('Concurrency — deposits', () => {
  it('20 concurrent deposits: all succeed with distinct refNos', async () => {
    const { byStatus } = await fireConcurrent(20, (i) =>
      request(app).post('/api/deposits').set(auth()).send({
        date: '2026-09-21',
        amount: 500,
        bankName: 'KCB',
        accountNo: 'ACC-1',
        sourceOfCash: 'Sunday collection',
        depositedBy: `Usher ${i}`,
      }),
    );

    expect(byStatus.get(201)).toBe(20);
    const rows = await prisma.deposit.findMany();
    expect(new Set(rows.map((r) => r.refNo)).size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// SALES — stock is the business rule; overselling is impossible
// ---------------------------------------------------------------------------
describe('Concurrency — inventory sales', () => {
  it('20 concurrent sales against stock of 15: exactly 15 succeed, 5 out-of-stock, never negative', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Concurrent Widget', sku: 'CW-1', category: 'Test', cost: 10, price: 20, stock: 15,
    });

    const { byStatus } = await fireConcurrent(20, () =>
      request(app).post('/api/inventory/sales').set(auth()).send({
        item: 'Concurrent Widget', time: '2026-09-21T10:00:00Z', amount: 20,
      }),
    );

    // Failures are business rules (422 out-of-stock), NOT deadlocks (500).
    expect(byStatus.get(201)).toBe(15);
    expect(byStatus.get(422)).toBe(5);
    expect(byStatus.get(500) ?? 0).toBe(0);
    expect(byStatus.get(599) ?? 0).toBe(0);

    // Database validation: stock exactly 0 (atomic deduction, no negative).
    const item = await prisma.inventoryItem.findFirst({ where: { name: 'Concurrent Widget' } });
    expect(item!.stock).toBe(0);

    // Exactly one sale row per successful operation — no duplicates, no orphans.
    const sales = await prisma.sale.findMany({ where: { item: 'Concurrent Widget' } });
    expect(sales).toHaveLength(15);
  });

  it('selling an unknown item is a 404 with no side effects', async () => {
    const res = await request(app).post('/api/inventory/sales').set(auth()).send({
      item: 'No Such Item', time: '2026-09-21T10:00:00Z', amount: 5,
    });
    expect(res.status).toBe(404);
    expect(await prisma.sale.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LEDGER TRANSFERS — conservation of balances, no deadlocks either direction
// ---------------------------------------------------------------------------
describe('Concurrency — ledger transfers', () => {
  async function makeLedger(name: string, balance: number) {
    const res = await request(app).post('/api/ledgers').set(auth()).send({ name, code: name, type: 'Cash', cashier: 'T', balance });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  it('20 same-direction transfers: all succeed, balances conserved exactly', async () => {
    const a = await makeLedger('LDR-A', 1000);
    const b = await makeLedger('LDR-B', 0);

    const { byStatus } = await fireConcurrent(20, () =>
      request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: a, toLedgerId: b, amount: 10 }),
    );

    expect(byStatus.get(201)).toBe(20);
    const ra = await prisma.ledger.findUnique({ where: { id: a } });
    const rb = await prisma.ledger.findUnique({ where: { id: b } });
    expect(toNum(ra!.balance)).toBe(800);
    expect(toNum(rb!.balance)).toBe(200);
    expect(await prisma.ledgerMovement.count()).toBe(20);
  });

  it('A→B and B→A simultaneously: zero deadlocks, balances conserved', async () => {
    const a = await makeLedger('LDR-A', 1000);
    const b = await makeLedger('LDR-B', 1000);

    // 10 transfers each way concurrently — the classic lock-order deadlock.
    const { byStatus } = await fireConcurrent(20, (i) => {
      const [from, to] = i % 2 === 0 ? [a, b] : [b, a];
      return request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: from, toLedgerId: to, amount: 5 });
    });

    expect(byStatus.get(201)).toBe(20); // all succeed — no deadlock losses
    expect(byStatus.get(500) ?? 0).toBe(0);
    const ra = await prisma.ledger.findUnique({ where: { id: a } });
    const rb = await prisma.ledger.findUnique({ where: { id: b } });
    expect(toNum(ra!.balance)).toBe(1000); // 10 out, 10 in
    expect(toNum(rb!.balance)).toBe(1000);
  });

  it('insufficient balance is a 422 business rule and the balance never goes negative', async () => {
    const a = await makeLedger('LDR-A', 50);
    const b = await makeLedger('LDR-B', 0);

    const { byStatus } = await fireConcurrent(20, () =>
      request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: a, toLedgerId: b, amount: 10 }),
    );

    expect(byStatus.get(201)).toBe(5); // 50/10 = exactly 5 transfers can succeed
    expect(byStatus.get(422)).toBe(15);
    const ra = await prisma.ledger.findUnique({ where: { id: a } });
    expect(toNum(ra!.balance)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DEBTOR PAYMENTS — no lost updates, no silent clamping
// ---------------------------------------------------------------------------
describe('Concurrency — debtor payments', () => {
  it('20 concurrent payments of 10 against balance 100: exactly 10 succeed, balance 0, never negative', async () => {
    const debtor = await request(app).post('/api/debtors').set(auth()).send({
      memberName: 'Concurrent Payer', contributionType: 'Tithe', amount: 100,
    });
    const id = debtor.body.id;

    const { byStatus } = await fireConcurrent(20, () =>
      request(app).post(`/api/debtors/${id}/payments`).set(auth()).send({ amountPaid: 10 }),
    );

    const winners = byStatus.get(200) ?? 0;
    expect(winners).toBe(10);
    // Losers fail with explicit business rules (409 conflict or 422 overpayment),
    // never 500s.
    expect((byStatus.get(409) ?? 0) + (byStatus.get(422) ?? 0)).toBe(10);
    expect(byStatus.get(500) ?? 0).toBe(0);

    const row = await prisma.debtor.findUnique({ where: { id } });
    expect(toNum(row!.amount)).toBe(0);
    expect(row!.status).toBe('Paid');
  });

  it('overpayment is rejected with 422 instead of silently clamping', async () => {
    const debtor = await request(app).post('/api/debtors').set(auth()).send({
      memberName: 'Overpayer', contributionType: 'Tithe', amount: 50,
    });
    const res = await request(app)
      .post(`/api/debtors/${debtor.body.id}/payments`)
      .set(auth())
      .send({ amountPaid: 60 });
    expect(res.status).toBe(422);
    expect(toNum((await prisma.debtor.findUnique({ where: { id: debtor.body.id } }))!.amount)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// CONTRIBUTIONS — idempotency-key dedup protects double posting
// ---------------------------------------------------------------------------
describe('Concurrency — contributions idempotency', () => {
  it('the same X-Idempotency-Key records exactly one contribution', async () => {
    const member = await prisma.christian.create({
      data: {
        regNo: 'REG-2026-099999', nationalId: 'ID-X', baptismalName: 'Idem', secondName: 'Potent',
        sirName: 'Key', phone: '+254700000009', diocese: 'Nairobi', parish: 'St. Mary', localChurch: 'Main', scc: 'SCC',
      },
    });
    const body = {
      christianId: member.id, memberName: 'Idem Potent Key', regNo: member.regNo,
      categories: ['Tithe'], monthlyTracker: { Jan: true }, amountKES: 500, date: '2026-09-21',
    };
    const headers = { ...auth(), 'x-idempotency-key': 'contribution-test-key-1' };

    const [r1, r2] = await Promise.all([
      request(app).post('/api/contributions').set(headers).send(body),
      request(app).post('/api/contributions').set(headers).send(body),
    ]);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers['x-cache-lookup']).toBe('HIT'); // the duplicate was replayed, not executed
    expect(await prisma.contribution.count({ where: { christianId: member.id } })).toBe(1);
  });

  it('failed (non-2xx) idempotent requests are not cached and can succeed on retry', async () => {
    const member = await prisma.christian.create({
      data: {
        regNo: 'REG-2026-099998', nationalId: 'ID-Y', baptismalName: 'Retry', secondName: 'After',
        sirName: 'Fail', phone: '+254700000008', diocese: 'Nairobi', parish: 'St. Mary', localChurch: 'Main', scc: 'SCC',
      },
    });
    const good = {
      christianId: member.id, memberName: 'Retry After Fail', regNo: member.regNo,
      categories: ['Offering'], monthlyTracker: {}, amountKES: 50, date: '2026-09-21',
    };
    const headers = { ...auth(), 'x-idempotency-key': 'contribution-test-key-2' };

    const bad = await request(app).post('/api/contributions').set(headers).send({ ...good, christianId: 'no-such-member' });
    expect(bad.status).toBe(400);

    const ok = await request(app).post('/api/contributions').set(headers).send(good);
    expect(ok.status).toBe(201);
    expect(await prisma.contribution.count({ where: { christianId: member.id } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Retry classifier — transient-only, never validation/permission
// ---------------------------------------------------------------------------
describe('retryOnTransient / isTransientTransactionError', () => {
  it('identifies deadlocks, serialization failures and P2034 as transient', () => {
    const mk = (props: object) => Object.assign(new Error('x'), props);
    expect(isTransientTransactionError(mk({ message: 'deadlock detected (40P01)' }))).toBe(true);
    expect(isTransientTransactionError(mk({ code: 'P2034' }))).toBe(true);
    expect(isTransientTransactionError(mk({ code: '40001' }))).toBe(true);
    expect(isTransientTransactionError(mk({ meta: { code: '40P01' } }))).toBe(true);
  });

  it('never classifies validation, permission or unique-constraint errors as transient', () => {
    const mk = (props: object) => Object.assign(new Error('x'), props);
    expect(isTransientTransactionError(mk({ code: 'P2002' }))).toBe(false);
    expect(isTransientTransactionError(mk({ code: 'P2025' }))).toBe(false);
    expect(isTransientTransactionError(new Error('Validation failed'))).toBe(false);
    expect(isTransientTransactionError(null)).toBe(false);
  });

  it('retries transient errors and eventually succeeds', async () => {
    let attempts = 0;
    const result = await retryOnTransient(
      async () => {
        attempts++;
        if (attempts < 3) throw Object.assign(new Error('deadlock detected'), { code: 'P2034' });
        return 'ok';
      },
      { maxAttempts: 5, baseDelayMs: 1, label: 'test' },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('gives up after maxAttempts on persistent transient errors', async () => {
    let attempts = 0;
    await expect(
      retryOnTransient(
        async () => {
          attempts++;
          throw Object.assign(new Error('deadlock detected'), { code: 'P2034' });
        },
        { maxAttempts: 3, baseDelayMs: 1, label: 'test' },
      ),
    ).rejects.toThrow('deadlock detected');
    expect(attempts).toBe(3);
  });

  it('never retries permanent errors', async () => {
    let attempts = 0;
    await expect(
      retryOnTransient(
        async () => {
          attempts++;
          throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        },
        { maxAttempts: 4, baseDelayMs: 1, label: 'test' },
      ),
    ).rejects.toThrow('unique constraint');
    expect(attempts).toBe(1);
  });
});
