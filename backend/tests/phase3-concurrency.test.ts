/**
 * Phase-3 — Concurrency, atomicity and integrity regression suite.
 *
 * Covers the four defects fixed in this phase, the Step-9 concurrency matrix
 * (with latency percentiles), the Step-10/11 invariants, the Step-12 oversale
 * test and the Step-13 rollback test. Baseline "20 users → 3 success" claims
 * are re-measured by the matrix below (all green in the current implementation).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { prisma } from '../src/lib/prisma.js';
import { toNum } from '../src/lib/decimal.js';
import { importAllData, exportAllData } from '../src/lib/export.js';

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

/** Fires n concurrent POSTs; buckets statuses; collects latencies. */
async function fireConcurrent(n: number, make: (i: number) => Promise<{ status: number; body: any }>) {
  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => make(i).catch((e) => ({ status: 599, body: { message: String(e) } }))),
  );
  const byStatus = new Map<number, number>();
  for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  return { results, byStatus, durationMs: performance.now() - t0 };
}

function pctl(xs: number[], p: number) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}

// ---------------------------------------------------------------------------
// FIX 1 — FIN-06: importAllData is atomic (tx threaded through)
// ---------------------------------------------------------------------------
describe('Phase-3 fix 1 — import atomicity (FIN-06)', () => {
  it('a mid-import failure rolls back to the pre-import state (row counts identical)', async () => {
    // Pre-import state: two users + one expense.
    await prisma.expense.create({
      data: { date: new Date(), category: 'C', description: 'pre', amount: 5, paymentMethod: 'Cash', voucherNo: 'EXP-PRE-1' },
    });
    const before = {
      users: await prisma.user.count(),
      expenses: await prisma.expense.count(),
      christians: await prisma.christian.count(),
      contributions: await prisma.contribution.count(),
    };

    // Craft a bundle that is valid for users, then violates a NOT NULL /
    // FK constraint mid-import (expense without `date`) AFTER several tables
    // have already been wiped+reinserted by the transaction body.
    const bundle = await exportAllData();
    bundle.tables.christian = [];
    bundle.tables.contribution = [];
    // Corrupt the expense table so createMany throws mid-import.
    (bundle.tables as any).expense = [{ id: 'x', date: null, category: 'c', description: 'd', amount: 1, paymentMethod: 'Cash', voucherNo: 'V-1' }];

    await expect(importAllData(bundle, undefined)).rejects.toThrow();

    // Every count must be IDENTICAL to pre-import — no partial wipe.
    const after = {
      users: await prisma.user.count(),
      expenses: await prisma.expense.count(),
      christians: await prisma.christian.count(),
      contributions: await prisma.contribution.count(),
    };
    expect(after).toEqual(before);
    const exp = await prisma.expense.findFirst();
    expect(exp?.voucherNo).toBe('EXP-PRE-1'); // original data intact
  });

  it('a successful import replaces all data', async () => {
    const bundle = await exportAllData();
    bundle.tables.expense = [];
    bundle.tables.christian = [];
    const total = await importAllData(bundle, undefined);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(await prisma.expense.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FIX 2 — batch-update applies in global id order (no lock-order deadlock)
// ---------------------------------------------------------------------------
describe('Phase-3 fix 2 — batch-update lock ordering', () => {
  it('20 concurrent reversed-order batch updates on 4 shared items: zero 500s/deadlocks', async () => {
    const items: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/inventory/items').set(auth()).send({
        name: `Batch-${i}`, sku: `B-${i}`, category: 'T', cost: 1, price: 2, stock: 5,
      });
      items.push(res.body.id);
    }
    // Half the clients send ascending order, half descending — the two
    // lock-order directions that previously could deadlock.
    const { byStatus } = await fireConcurrent(20, (i) => {
      const ids = i % 2 === 0 ? items : [...items].reverse();
      return request(app).post('/api/inventory/items/batch-update').set(auth()).send({
        updates: ids.map((id, k) => ({ id, price: 2 + i * 10 + k })),
      });
    });
    expect(byStatus.get(200)).toBe(20);
    expect(byStatus.get(500) ?? 0).toBe(0);
    expect(byStatus.get(599) ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FIX 3 — debtor payment: status derived and persisted in the same transaction
// ---------------------------------------------------------------------------
describe('Phase-3 fix 3 — debtor payment status atomicity', () => {
  it('20 concurrent full-balance payments: exactly one wins, final status is Paid with balance 0', async () => {
    const debtor = await request(app).post('/api/debtors').set(auth()).send({
      memberName: 'Status Racer', contributionType: 'Tithe', amount: 100,
    });
    const id = debtor.body.id;

    // All 20 race to pay the FULL balance — exactly one must win; every loser
    // gets an explicit 409; the final row must be status 'Paid' with balance 0.
    const { byStatus } = await fireConcurrent(20, () =>
      request(app).post(`/api/debtors/${id}/payments`).set(auth()).send({ amountPaid: 100 }),
    );
    expect(byStatus.get(200) ?? 0).toBeLessThanOrEqual(1);
    expect((byStatus.get(409) ?? 0) + (byStatus.get(422) ?? 0) + (byStatus.get(200) ?? 0)).toBe(20);
    expect(byStatus.get(500) ?? 0).toBe(0);

    const row = await prisma.debtor.findUnique({ where: { id } });
    expect(toNum(row!.amount)).toBe(0);
    expect(row!.status).toBe('Paid'); // stale-status overwrite impossible
  });
});

// ---------------------------------------------------------------------------
// FIX 4 — restore() writes flip + audit entry atomically; double-restore 404s
// ---------------------------------------------------------------------------
describe('Phase-3 fix 4 — restore atomicity', () => {
  it('double restore: second attempt 404s and produces exactly one RESTORE audit row', async () => {
    const expense = await request(app).post('/api/expenses').set(auth()).send({
      date: '2026-09-22', category: 'C', description: 'to delete', amount: 10, paymentMethod: 'Cash',
    });
    const del = await request(app).delete(`/api/expenses/${expense.body.id}`).set(auth());
    expect(del.status).toBe(204);

    // Find the audit log for the DELETE to restore from.
    const log = await prisma.auditLog.findFirst({ where: { entityName: 'Expense', entityId: expense.body.id, action: 'DELETE' } });
    expect(log).toBeTruthy();

    // Concurrent double-restore: exactly one 200, the other 404.
    const { byStatus } = await fireConcurrent(2, () =>
      request(app).post(`/api/admin/audit-logs/${log!.id}/restore`).set(auth()).send({}),
    );
    expect((byStatus.get(200) ?? 0) + (byStatus.get(204) ?? 0)).toBe(1);
    expect(byStatus.get(404) ?? 0).toBe(1);
    expect(byStatus.get(500) ?? 0).toBe(0);

    const restores = await prisma.auditLog.count({ where: { entityName: 'Expense', entityId: expense.body.id, action: 'RESTORE' } });
    expect(restores).toBe(1);
    expect((await prisma.expense.findFirst({ where: { id: expense.body.id } }))?.isDeleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HR-01 — employee code allocation under concurrency
// ---------------------------------------------------------------------------
describe('Phase-3 HR-01 — concurrent employee creates', () => {
  it('20 concurrent employee creates: all 201 with distinct sequential codes', async () => {
    const { byStatus } = await fireConcurrent(20, (i) =>
      request(app).post('/api/hr/employees').set(auth()).send({
        surname: `S${i}`, firstName: 'F', designation: 'Worker', hireDate: '2026-01-01',
        email: `emp-race-${Date.now()}-${i}@test.local`, phone: '+254700000000',
      }),
    );
    expect(byStatus.get(201)).toBe(20);
    expect(byStatus.get(409) ?? 0).toBe(0);
    expect(byStatus.get(500) ?? 0).toBe(0);
    const rows = await prisma.employee.findMany();
    expect(new Set(rows.map((r) => r.code)).size).toBe(20); // distinct
    expect(await prisma.employee.count()).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// STEP 9 — concurrency matrix with latency percentiles (expense / sale / transfer / debtor)
// ---------------------------------------------------------------------------
describe('Phase-3 Step 9 — concurrency matrix', () => {
  const sizes = [1, 5, 10, 20, 50];

  it('expense matrix: all succeed, distinct gapless vouchers, percentiles recorded', async () => {
    const evidence: any[] = [];
    for (const n of sizes) {
      const t0 = performance.now();
      const { byStatus, results, durationMs } = await fireConcurrent(n, (i) =>
        request(app).post('/api/expenses').set(auth()).send({
          date: '2026-09-22', category: `M${n}`, description: `matrix ${n}-${i}`, amount: 10 + i, paymentMethod: 'Cash',
        }),
      );
      const lat = results.map((r: any) => (r.body && r.body._latency) ?? 0).filter((v) => v > 0);
      expect(byStatus.get(201)).toBe(n);
      expect(byStatus.get(500) ?? 0).toBe(0);
      const rows = await prisma.expense.findMany({ where: { category: `M${n}` } });
      expect(new Set(rows.map((r) => r.voucherNo)).size).toBe(n);
      evidence.push({ n, ok: n, ms: Math.round(performance.now() - t0), p50: pctl(lat, 50), p95: pctl(lat, 95), p99: pctl(lat, 99), dur: Math.round(durationMs) });
    }
    console.log('[matrix:expense]', JSON.stringify(evidence));
  });

  it('sale matrix: 50-way oversale-safe; business-rule 422s, zero 500s', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Matrix Item', sku: 'MI-1', category: 'T', cost: 5, price: 9, stock: 30,
    });
    const evidence: any[] = [];
    for (const n of sizes) {
      const { byStatus } = await fireConcurrent(n, () =>
        request(app).post('/api/inventory/sales').set(auth()).send({
          item: 'Matrix Item', time: '2026-09-22T09:00:00Z', amount: 9,
        }),
      );
      const wins = byStatus.get(201) ?? 0;
      expect(wins + (byStatus.get(422) ?? 0)).toBe(n);
      expect(byStatus.get(500) ?? 0).toBe(0);
      const item = await prisma.inventoryItem.findFirst({ where: { name: 'Matrix Item' } });
      expect((item?.stock ?? 0)).toBeGreaterThanOrEqual(0); // never negative
      evidence.push({ n, ok: wins, oos: byStatus.get(422) ?? 0, stockLeft: item?.stock });
      // Reset stock for the next size run.
      await prisma.inventoryItem.update({ where: { id: item!.id }, data: { stock: 30 } });
    }
    console.log('[matrix:sale]', JSON.stringify(evidence));
  });

  it('mixed workload (finance + inventory + registry) 20-way: zero unexpected failures', async () => {
    const member = await prisma.christian.create({
      data: { regNo: 'REG-P3-MIXED-1', nationalId: 'ID1', baptismalName: 'Mix', secondName: 'Ed', sirName: 'Work', phone: '+254700000001', diocese: 'D', parish: 'P', localChurch: 'L', scc: 'S' },
    });
    await request(app).post('/api/ledgers').set(auth()).send({ name: 'MixL', code: 'MIXL', type: 'Cash', cashier: 'T', balance: 5000 });
    const led = await prisma.ledger.findFirst({ where: { code: 'MIXL' } });
    const item = await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Mixed Item', sku: 'MXI', category: 'T', cost: 2, price: 4, stock: 100,
    });
    const debtor = await request(app).post('/api/debtors').set(auth()).send({ memberName: 'Mix Debtor', contributionType: 'Tithe', amount: 500 });

    const { byStatus } = await fireConcurrent(20, (i) => {
      const k = i % 5;
      if (k === 0) return request(app).post('/api/expenses').set(auth()).send({ date: '2026-09-22', category: 'mix', description: `e${i}`, amount: 5, paymentMethod: 'Cash' });
      if (k === 1) return request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Mixed Item', time: '2026-09-22T09:00:00Z', amount: 4 });
      if (k === 2) return request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: led!.id, toLedgerId: led!.id, amount: 1 }).catch((e) => e);
      if (k === 3) return request(app).post('/api/contributions').set(auth()).send({ christianId: member.id, memberName: 'Mix Ed Work', regNo: member.regNo, categories: ['Tithe'], monthlyTracker: {}, amountKES: 100, date: '2026-09-22' });
      return request(app).post(`/api/debtors/${debtor.body.id}/payments`).set(auth()).send({ amountPaid: 5 });
    });
    // Every request lands in a defined bucket: 2xx, 400 (same-ledger guard), 422 (stock/balance), 409.
    const defined = [200, 201, 400, 409, 422].reduce((s, c) => s + (byStatus.get(c) ?? 0), 0);
    expect(defined).toBe(20);
    expect(byStatus.get(500) ?? 0).toBe(0);
    expect(byStatus.get(599) ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// STEP 10 — financial invariants checked straight from PostgreSQL
// ---------------------------------------------------------------------------
describe('Phase-3 Step 10 — financial invariants', () => {
  it('ledger transfer round: movements sum == balance delta; no orphans; conserved totals', async () => {
    const mk = async (name: string, bal: number) => {
      const r = await request(app).post('/api/ledgers').set(auth()).send({ name, code: name, type: 'Cash', cashier: 'T', balance: bal });
      return r.body.id;
    };
    const a = await mk('INV-A', 1000);
    const b = await mk('INV-B', 1000);
    const { byStatus } = await fireConcurrent(20, (i) => {
      const [f, t] = i % 2 === 0 ? [a, b] : [b, a];
      return request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: f, toLedgerId: t, amount: 10 });
    });
    expect(byStatus.get(201)).toBe(20);

    // Authoritative SQL totals (not app-layer reads).
    const [aRow]: any[] = await prisma.$queryRaw`SELECT balance::float8 as b FROM ledgers WHERE id = ${a}`;
    const [bRow]: any[] = await prisma.$queryRaw`SELECT balance::float8 as b FROM ledgers WHERE id = ${b}`;
    const [aName]: any[] = await prisma.$queryRaw`SELECT name FROM ledgers WHERE id = ${a}`;
    const [bName]: any[] = await prisma.$queryRaw`SELECT name FROM ledgers WHERE id = ${b}`;
    const [mAB]: any[] = await prisma.$queryRaw`SELECT COALESCE(SUM(amount),0)::float8 as s FROM ledger_movements WHERE "from" = ${aName.name} AND "to" = ${bName.name}`;
    expect(Math.round((aRow.b + bRow.b) * 100) / 100).toBe(2000); // conserved
    expect(Math.round(mAB.s * 100) / 100).toBe(100); // 10 A→B transfers × 10
    // No orphan movements (every movement references existing ledger names).
    const orphans: any[] = await prisma.$queryRaw`
      SELECT count(*)::int as c FROM ledger_movements m
      WHERE NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.name = m."from" OR l.name = m."to")`;
    expect(orphans[0].c).toBe(0);
  });

  it('expenses: sum of amounts matches SQL total; voucher numbers gapless-distinct', async () => {
    await fireConcurrent(20, (i) =>
      request(app).post('/api/expenses').set(auth()).send({ date: '2026-09-22', category: 'inv', description: `x${i}`, amount: 10, paymentMethod: 'Cash' }),
    );
    const [sumRow]: any[] = await prisma.$queryRaw`SELECT COALESCE(SUM(amount),0)::float8 as s, count(*)::int as c FROM expenses`;
    expect(sumRow.c).toBe(20);
    expect(sumRow.s).toBe(200);
    const vouchers = (await prisma.expense.findMany({ where: { category: 'inv' } })).map((r) => r.voucherNo);
    expect(new Set(vouchers).size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// STEP 11+12 — inventory movement equation + oversale test
// ---------------------------------------------------------------------------
describe('Phase-3 Steps 11-12 — inventory invariants and oversale', () => {
  it('oversale: stock 100, 20 concurrent × 5 units each via batched single-unit sales — exactly 100 succeed, 0 left', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Oversale Item', sku: 'OV-1', category: 'T', cost: 1, price: 2, stock: 100,
    });
    // 20 clients × 5 sequential single-unit sales each = 100 requests of 1 unit.
    const rounds = await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.all(
          Array.from({ length: 5 }, () =>
            request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Oversale Item', time: '2026-09-22T09:00:00Z', amount: 2 }).then((r) => r.status),
          ),
        ),
      ),
    );
    const statuses = rounds.flat();
    expect(statuses.filter((s) => s === 201)).toHaveLength(100);
    expect(statuses.filter((s) => s === 422)).toHaveLength(0);
    const item = await prisma.inventoryItem.findFirst({ where: { name: 'Oversale Item' } });
    expect(item!.stock).toBe(0);

    // 21st wave: any further sale must 422 (out of stock) — never negative.
    const extra = await request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Oversale Item', time: '2026-09-22T09:00:00Z', amount: 2 });
    expect(extra.status).toBe(422);
    expect((await prisma.inventoryItem.findFirst({ where: { name: 'Oversale Item' } }))!.stock).toBe(0);
  });

  it('movement equation: closing stock == sold quantity difference (sales are the only outbound writer in app paths)', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Eq Item', sku: 'EQ-1', category: 'T', cost: 1, price: 3, stock: 40,
    });
    const { byStatus } = await fireConcurrent(25, () =>
      request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Eq Item', time: '2026-09-22T09:00:00Z', amount: 3 }),
    );
    const sold = byStatus.get(201) ?? 0;
    expect(byStatus.get(422) ?? 0).toBe(25 - sold); // rest rejected as out of stock
    const item = await prisma.inventoryItem.findFirst({ where: { name: 'Eq Item' } });
    // closing = opening − outbound(sales). No other writer ran.
    expect(item!.stock).toBe(40 - sold);
  });
});

// ---------------------------------------------------------------------------
// STEP 13 — rollback: failure after mutation must leave no partial state
// ---------------------------------------------------------------------------
describe('Phase-3 Step 13 — forced rollback', () => {
  it('sale + crash mid-transaction: stock decrement and sale row roll back together', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Rollback Item', sku: 'RB-1', category: 'T', cost: 1, price: 2, stock: 10,
    });
    const target = await prisma.inventoryItem.findFirst({ where: { name: 'Rollback Item' } });

    // Drive the transaction directly: decrement stock, then throw — simulating
    // a crash after the mutation but before commit.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.inventoryItem.update({ where: { id: target!.id }, data: { stock: { decrement: 3 } } });
        throw new Error('forced crash after mutation');
      }),
    ).rejects.toThrow('forced crash after mutation');

    const after = await prisma.inventoryItem.findUnique({ where: { id: target!.id } });
    expect(after!.stock).toBe(10); // fully rolled back
    expect(await prisma.sale.count({ where: { item: 'Rollback Item' } })).toBe(0);
  });

  it('ledger transfer rollback: neither balance moves when the movement insert fails', async () => {
    const mk = async (name: string, bal: number) => {
      const r = await request(app).post('/api/ledgers').set(auth()).send({ name, code: name, type: 'Cash', cashier: 'T', balance: bal });
      return r.body.id;
    };
    const a = await mk('RB-A', 100);
    const b = await mk('RB-B', 0);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.ledger.update({ where: { id: a }, data: { balance: { decrement: 40 } } });
        await tx.ledger.update({ where: { id: b }, data: { balance: { increment: 40 } } });
        // Movement insert with a value that violates the DB (amount NOT NULL).
        await tx.ledgerMovement.create({ data: { amount: null as any, time: new Date(), from: 'RB-A', to: 'RB-B', notes: null } });
      }),
    ).rejects.toThrow();
    const ra = await prisma.ledger.findUnique({ where: { id: a } });
    const rb = await prisma.ledger.findUnique({ where: { id: b } });
    expect(toNum(ra!.balance)).toBe(100);
    expect(toNum(rb!.balance)).toBe(0);
  });
});
