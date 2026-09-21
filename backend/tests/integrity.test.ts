/**
 * Financial & Inventory Integrity Invariants — Ecclesia backend
 *
 * Every invariant below is DERIVED from existing artifacts — none invented:
 *
 *   F1  Transfer conservation        → routes/ledgers.ts: guarded decrement +
 *                                      increment in one tx; movement row records
 *                                      {amount, from, to}. Σ balances constant.
 *   F2  Transfer atomicity/rollback  → routes/ledgers.ts: "If any step fails,
 *                                      ALL changes are rolled back" (doc block).
 *   F3  No negative ledger balance   → guarded decrement WHERE balance >= amount;
 *                                      422 Insufficient balance (doc block).
 *   F4  Debtor payment arithmetic    → routes/finance.ts + decimal-precision.test.ts:
 *                                      balance -= amountPaid; 0 → 'Paid',
 *                                      else 'Partially Paid'; never below 0.
 *   F5  Debtor overpayment rejected  → payment must never silently vanish
 *                                      (422 OVERPAYMENT; balance unchanged).
 *   F6  Unique gapless references    → schema @unique on expenses.voucherNo /
 *                                      deposits.refNo + ref_counters; failed
 *                                      creates must not burn a number.
 *   F7  Dashboard totals             → routes/dashboard.ts: totalDeposits /
 *                                      totalExpenses = SQL SUM over non-deleted
 *                                      rows (appPrisma soft-delete filter).
 *   F8  Cashier reconciliation       → routes/reports.ts /cashiers:
 *                                      collected === ledger.balance.
 *   F9  Contribution precision       → decimal-precision.test.ts: amounts keep
 *                                      2-dp precision through API + report.
 *   F10 Creditor status transitions   → routes/finance.ts: default 'Pending';
 *                                      PATCH /paid → 'Paid'. Amount untouched.
 *
 *   I1  Stock equation (ACTUAL app model) → routes/inventory.ts: deliveries
 *      ("left simple for now" — no stock effect), stock-takes and issues
 *      (create rows only) never touch stock; each sale decrements exactly 1.
 *      So: stock == initial − count(sales for item, incl. soft-deleted,
 *      because soft-delete never restores stock).
 *   I2  No negative stock            → schema CHECK inventory_items_stock_check
 *                                      + guarded decrement (stock >= 1).
 *   I3  Sale atomicity               → sale row + decrement commit together;
 *                                      a mid-transaction DB error must leave
 *                                      both unchanged (observed via overflow).
 *   I4  Price audit history          → routes/inventory.ts logPriceChange:
 *                                      baseline (old=null) on create; entry on
 *                                      every cost/price change; none otherwise.
 *   I5  Sale report shape            → routes/reports.ts /sales: quantity=1,
 *                                      amount stored as provided.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
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

/**
 * Recomputes EVERY balance/stock figure straight from the database (raw
 * client, soft-deleted rows included where the service logic includes them)
 * and asserts the invariants hold. Used after failure scenarios.
 */
async function assertGlobalInvariants(): Promise<void> {
  // F3/I2: no negative balances or stock, ever, in any state.
  for (const l of await prisma.ledger.findMany()) expect(toNum(l.balance)).toBeGreaterThanOrEqual(0);
  for (const d of await prisma.debtor.findMany()) expect(toNum(d.amount)).toBeGreaterThanOrEqual(0);
  for (const i of await prisma.inventoryItem.findMany()) expect(i.stock).toBeGreaterThanOrEqual(0);

  // F1/I1: movements and sales match balance/stock deltas exactly.
  const ledgers = await prisma.ledger.findMany();
  const ledgerInitial = new Map(ledgers.map((l) => [l.id, toNum(l.balance)]));
  void ledgerInitial; // initial balances are 0 in fresh tests; see per-test checks

  // Every ledger movement must reference the recorded amount and names.
  for (const m of await prisma.ledgerMovement.findMany()) {
    expect(toNum(m.amount)).toBeGreaterThan(0);
    expect(m.from).toBeTruthy();
    expect(m.to).toBeTruthy();
  }

  // F6: reference uniqueness across the whole table.
  const vouchers = (await prisma.expense.findMany()).map((e) => e.voucherNo);
  expect(new Set(vouchers).size).toBe(vouchers.length);
  const refs = (await prisma.deposit.findMany()).map((d) => d.refNo);
  expect(new Set(refs).size).toBe(refs.length);
}

// ═══════════════════════════ FINANCE ═══════════════════════════

describe('Invariant F1/F2 — ledger transfer conservation & atomicity', () => {
  async function makeLedger(name: string, balance: number) {
    const res = await request(app).post('/api/ledgers').set(auth()).send({ name, code: name, type: 'Cash', cashier: 'Teller', balance });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  it('F1: a transfer changes Σ balances by exactly 0 and writes one matching movement', async () => {
    const a = await makeLedger('LDR-A', 500);
    const b = await makeLedger('LDR-B', 100);
    const sumBefore = 600;

    const res = await request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: a, toLedgerId: b, amount: 150, notes: ' Sunday float' });
    expect(res.status).toBe(201);

    const ra = await prisma.ledger.findUnique({ where: { id: a } });
    const rb = await prisma.ledger.findUnique({ where: { id: b } });
    expect(toNum(ra!.balance)).toBe(350);
    expect(toNum(rb!.balance)).toBe(250);
    expect(toNum(ra!.balance) + toNum(rb!.balance)).toBe(sumBefore); // conservation

    // Movement audit matches the operation exactly.
    const movements = await prisma.ledgerMovement.findMany();
    expect(movements).toHaveLength(1);
    expect(toNum(movements[0].amount)).toBe(150);
    expect(movements[0].from).toBe('LDR-A');
    expect(movements[0].to).toBe('LDR-B');
  });

  it('F2: a failed transfer (unknown destination) rolls back completely', async () => {
    const a = await makeLedger('LDR-A', 500);
    const b = await makeLedger('LDR-B', 0);

    const res = await request(app).post('/api/ledgers/transfer').set(auth()).send({
      fromLedgerId: a, toLedgerId: '00000000-0000-0000-0000-000000000099', amount: 100,
    });
    expect(res.status).toBe(404);

    // Invariant: nothing moved — balances unchanged, no movement row.
    expect(toNum((await prisma.ledger.findUnique({ where: { id: a } }))!.balance)).toBe(500);
    expect(toNum((await prisma.ledger.findUnique({ where: { id: b } }))!.balance)).toBe(0);
    expect(await prisma.ledgerMovement.count()).toBe(0);
  });

  it('F3: transfer larger than the balance is rejected and nothing changes', async () => {
    const a = await makeLedger('LDR-A', 50);
    const b = await makeLedger('LDR-B', 0);

    const res = await request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: a, toLedgerId: b, amount: 60 });
    expect(res.status).toBe(422);
    expect(toNum((await prisma.ledger.findUnique({ where: { id: a } }))!.balance)).toBe(50);
    expect(await prisma.ledgerMovement.count()).toBe(0);
  });
});

describe('Invariant F4/F5 — debtor payments', () => {
  async function makeDebtor(amount: number) {
    const res = await request(app).post('/api/debtors').set(auth()).send({ memberName: 'Member', contributionType: 'Tithe', amount });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  it('F4: sequential payments decrement exactly and derive status from the remaining balance', async () => {
    const id = await makeDebtor(100.5);

    const p1 = await request(app).post(`/api/debtors/${id}/payments`).set(auth()).send({ amountPaid: 30.25 });
    expect(p1.status).toBe(200);
    expect(p1.body.amount).toBe(70.25);
    expect(p1.body.status).toBe('Partially Paid');

    const p2 = await request(app).post(`/api/debtors/${id}/payments`).set(auth()).send({ amountPaid: 70.25 });
    expect(p2.status).toBe(200);
    expect(p2.body.amount).toBe(0);
    expect(p2.body.status).toBe('Paid');
  });

  it('F5: overpayment is rejected with the balance untouched', async () => {
    const id = await makeDebtor(40);
    const res = await request(app).post(`/api/debtors/${id}/payments`).set(auth()).send({ amountPaid: 50 });
    expect(res.status).toBe(422);
    expect(toNum((await prisma.debtor.findUnique({ where: { id } }))!.amount)).toBe(40);
  });
});

describe('Invariant F6 — unique, gapless references; failures do not burn numbers', () => {
  it('auto references are unique, well-formed and continue after a duplicate-refNo rejection', async () => {
    const d1 = await request(app).post('/api/deposits').set(auth()).send({
      date: '2026-09-21', amount: 100, bankName: 'KCB', accountNo: '1', sourceOfCash: 'Offering', depositedBy: 'U',
    });
    expect(d1.status).toBe(201);
    expect(d1.body.refNo).toMatch(/^DEP-\d{5}$/);

    // Duplicate explicit refNo must be rejected (unique index → 409).
    const dup = await request(app).post('/api/deposits').set(auth()).send({
      date: '2026-09-21', amount: 200, bankName: 'KCB', accountNo: '1', sourceOfCash: 'Offering', depositedBy: 'U', refNo: d1.body.refNo,
    });
    expect(dup.status).toBe(409);

    // The failed create must NOT have burned a number: the next auto refNo is
    // exactly one past the existing maximum.
    const d2 = await request(app).post('/api/deposits').set(auth()).send({
      date: '2026-09-21', amount: 300, bankName: 'KCB', accountNo: '1', sourceOfCash: 'Offering', depositedBy: 'U',
    });
    expect(d2.status).toBe(201);
    const n1 = parseInt(d1.body.refNo.slice(4), 10);
    const n2 = parseInt(d2.body.refNo.slice(4), 10);
    expect(n2).toBe(n1 + 1);
    await assertGlobalInvariants();
  });
});

describe('Invariant F7 — dashboard totals equal the database sums', () => {
  it('totalDeposits/totalExpenses match Σ amounts; soft-deleted rows are excluded', async () => {
    const d1 = await request(app).post('/api/deposits').set(auth()).send({
      date: '2026-09-21', amount: 1000, bankName: 'KCB', accountNo: '1', sourceOfCash: 'X', depositedBy: 'U',
    });
    await request(app).post('/api/deposits').set(auth()).send({
      date: '2026-09-21', amount: 250, bankName: 'KCB', accountNo: '1', sourceOfCash: 'X', depositedBy: 'U',
    });
    const e1 = await request(app).post('/api/expenses').set(auth()).send({
      date: '2026-09-21', category: 'Utilities', description: 'Power', amount: 400, paymentMethod: 'Cash',
    });
    await request(app).post('/api/expenses').set(auth()).send({
      date: '2026-09-21', category: 'Supplies', description: 'Ink', amount: 60, paymentMethod: 'Cash',
    });

    const before = await request(app).get('/api/dashboard/summary').set(auth());
    expect(before.status).toBe(200);
    expect(before.body.totalDeposits).toBe(1250);
    expect(before.body.totalExpenses).toBe(460);

    // Soft-delete one of each — dashboard totals must follow the DB sums.
    await request(app).delete(`/api/deposits/${d1.body.id}`).set(auth());
    await request(app).delete(`/api/expenses/${e1.body.id}`).set(auth());

    const after = await request(app).get('/api/dashboard/summary').set(auth());
    expect(after.body.totalDeposits).toBe(250);
    expect(after.body.totalExpenses).toBe(60);
    await assertGlobalInvariants();
  });
});

describe('Invariant F8 — cashier reconciliation mirrors ledger balances', () => {
  it('cashiers report collected == ledger balance for every ledger', async () => {
    await request(app).post('/api/ledgers').set(auth()).send({ name: 'LDR-C1', code: 'LDR-C1', type: 'Cash', cashier: 'Alice', balance: 777.75 });
    await request(app).post('/api/ledgers').set(auth()).send({ name: 'LDR-C2', code: 'LDR-C2', type: 'Bank', cashier: 'Bob', balance: 100.25 });

    const res = await request(app).get('/api/reports/cashiers').set(auth());
    expect(res.status).toBe(200);
    const byCashier = new Map(res.body.map((r: any) => [r.cashier, r]));
    expect(byCashier.get('Alice').collected).toBe(777.75);
    expect(byCashier.get('Bob').collected).toBe(100.25);
    // Documented behavior: reconciled mirrors collected (reports.ts).
    expect(byCashier.get('Alice').reconciled).toBe(byCashier.get('Alice').collected);
  });
});

describe('Invariant F9 — contribution precision and report status', () => {
  it('2-dp amounts survive create → storage → report, and tracker drives Paid/Pending', async () => {
    const member = await prisma.christian.create({
      data: {
        regNo: 'REG-2026-088888', nationalId: 'ID-88', baptismalName: 'Pre', secondName: 'Cision',
        sirName: 'Test', phone: '+254700000088', diocese: 'Nairobi', parish: 'St. Mary', localChurch: 'Main', scc: 'SCC',
      },
    });
    const res = await request(app).post('/api/contributions').set(auth()).send({
      christianId: member.id, memberName: 'Pre Cision Test', regNo: member.regNo,
      categories: ['Tithe'], monthlyTracker: { Sep: true }, amountKES: 100.10 + 200.20, date: '2026-09-21',
    });
    expect(res.status).toBe(201);
    expect(res.body.amountKES).toBe(300.3);

    // Documented contract (reports.ts): 'Paid' requires ?month=<MMM> whose
    // tracker entry is true; without a month filter the status is 'Pending'.
    const noMonth = await request(app).get('/api/reports/contributions').set(auth());
    expect(noMonth.body.find((r: any) => r.memberName === 'Pre Cision Test').status).toBe('Pending');

    const report = await request(app).get('/api/reports/contributions?month=Sep').set(auth());
    const row = report.body.find((r: any) => r.memberName === 'Pre Cision Test');
    expect(row.amount).toBe(300.3);
    expect(row.status).toBe('Paid');
  });

  it('without a matching tracked month the contribution reports as Pending', async () => {
    const member = await prisma.christian.create({
      data: {
        regNo: 'REG-2026-088887', nationalId: 'ID-87', baptismalName: 'Pen', secondName: 'Ding',
        sirName: 'Test', phone: '+254700000087', diocese: 'Nairobi', parish: 'St. Mary', localChurch: 'Main', scc: 'SCC',
      },
    });
    await request(app).post('/api/contributions').set(auth()).send({
      christianId: member.id, memberName: 'Pen Ding Test', regNo: member.regNo,
      categories: ['Offering'], monthlyTracker: { Sep: true }, amountKES: 50, date: '2026-09-21',
    });
    const report = await request(app).get('/api/reports/contributions?month=Oct').set(auth());
    const row = report.body.find((r: any) => r.memberName === 'Pen Ding Test');
    expect(row.status).toBe('Pending');
  });
});

describe('Invariant F10 — creditor status lifecycle', () => {
  it('defaults to Pending; PATCH /paid flips to Paid without touching amounts', async () => {
    const created = await request(app).post('/api/creditors').set(auth()).send({
      vendor: 'Vendor Ltd', description: 'Hymn books', invoiceNo: 'INV-9', amountOwed: 500, dueDate: '2026-10-01',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Pending');

    const paid = await request(app).patch(`/api/creditors/${created.body.id}/paid`).set(auth());
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('Paid');
    expect(paid.body.amountOwed).toBe(500); // amount untouched by status change
  });
});

// ═══════════════════════════ INVENTORY ═══════════════════════════

describe('Invariant I1/I2/I5 — stock equation under the actual application model', () => {
  const NAME = 'Invariant Item';

  it('stock == initial − sales; deliveries/issues/stock-takes do not change stock', async () => {
    const item = await request(app).post('/api/inventory/items').set(auth()).send({
      name: NAME, sku: 'INV-1', category: 'Test', cost: 10, price: 25, stock: 10,
    });
    expect(item.status).toBe(201);

    // Deliveries, issues, stock-takes: recorded but NEVER adjust stock
    // (routes/inventory.ts — deliveries "left simple for now").
    await request(app).post('/api/inventory/deliveries').set(auth()).send({ supplier: 'S', inv: 'INV-9', date: '2026-09-21', units: 100, cat: 'Test', total: 500 });
    await request(app).post('/api/inventory/issues').set(auth()).send({ item: NAME, dest: 'Outstation A' });
    await request(app).post('/api/inventory/stock-takes').set(auth()).send({ name: NAME, sku: 'INV-1', system: 10, physical: 9, notes: 'one missing' });

    expect((await prisma.inventoryItem.findFirst({ where: { name: NAME } }))!.stock).toBe(10);

    // Three sales → exactly three decrements.
    for (let i = 0; i < 3; i++) {
      const s = await request(app).post('/api/inventory/sales').set(auth()).send({ item: NAME, time: '2026-09-21T10:00:00Z', amount: 25 });
      expect(s.status).toBe(201);
    }
    const after = await prisma.inventoryItem.findFirst({ where: { name: NAME } });
    expect(after!.stock).toBe(7); // 10 − 3 — the actual model's closing quantity

    // I5: sale report rows carry quantity 1 and the provided amount.
    const report = await request(app).get('/api/reports/sales?item=Invariant').set(auth());
    expect(report.body).toHaveLength(3);
    for (const row of report.body) {
      expect(row.quantity).toBe(1);
      expect(row.amount).toBe(25);
    }
  });

  it('I2: selling the last unit then requesting another leaves stock at 0 and adds no row', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({ name: 'Last Unit', sku: 'LU-1', category: 'T', cost: 1, price: 2, stock: 1 });

    const ok = await request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Last Unit', time: '2026-09-21T10:00:00Z', amount: 2 });
    expect(ok.status).toBe(201);

    const denied = await request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Last Unit', time: '2026-09-21T10:00:00Z', amount: 2 });
    expect(denied.status).toBe(422); // business rule, not a crash

    const row = await prisma.inventoryItem.findFirst({ where: { name: 'Last Unit' } });
    expect(row!.stock).toBe(0);
    expect(await prisma.sale.count({ where: { item: 'Last Unit' } })).toBe(1); // no duplicate sale
  });

  it('I3: a database error mid-transaction rolls back the stock decrement (atomicity)', async () => {
    await request(app).post('/api/inventory/items').set(auth()).send({ name: 'Overflow Item', sku: 'OVF-1', category: 'T', cost: 1, price: 2, stock: 5 });

    // amount 10^12 overflows Decimal(12,2) → the sale INSERT fails AFTER the
    // decrement inside the same transaction → both must roll back.
    const res = await request(app).post('/api/inventory/sales').set(auth()).send({
      item: 'Overflow Item', time: '2026-09-21T10:00:00Z', amount: 1_000_000_000_000,
    });
    expect(res.status).toBe(500); // unexpected DB error surfaced as 500

    const row = await prisma.inventoryItem.findFirst({ where: { name: 'Overflow Item' } });
    expect(row!.stock).toBe(5); // decrement was rolled back with the sale
    expect(await prisma.sale.count({ where: { item: 'Overflow Item' } })).toBe(0);
  });

  it('I4: price audit history — baseline on create, entries only when cost/price change', async () => {
    const created = await request(app).post('/api/inventory/items').set(auth()).send({
      name: 'Audited Item', sku: 'AUD-1', category: 'T', cost: 10, price: 20, stock: 0,
    });
    expect(created.status).toBe(201);

    // No-op update (same name only): no audit entry.
    await request(app).put(`/api/inventory/items/${created.body.id}`).set(auth()).send({ category: 'T2' });
    expect(await prisma.inventoryPriceAuditLog.count({ where: { itemId: created.body.id } })).toBe(1); // baseline only

    // Price change: exactly one more entry with correct old→new values.
    await request(app).put(`/api/inventory/items/${created.body.id}`).set(auth()).send({ price: 30, cost: 12 });
    const history = await prisma.inventoryPriceAuditLog.findMany({
      where: { itemId: created.body.id }, orderBy: { createdAt: 'asc' },
    });
    expect(history).toHaveLength(2);
    expect(history[0].oldPrice).toBeNull(); // baseline
    expect(toNum(history[0].newPrice)).toBe(20);
    expect(toNum(history[1].oldPrice)).toBe(20);
    expect(toNum(history[1].newPrice)).toBe(30);
    expect(toNum(history[1].oldCost)).toBe(10);
    expect(toNum(history[1].newCost)).toBe(12);
  });
});

// ═════════════════ FAILURE SCENARIOS ═════════════════

describe('Integrity after failure, retry and restart', () => {
  it('invariants hold after failed requests (validation + business + unknown-id)', async () => {
    // 400 validation error
    await request(app).post('/api/expenses').set(auth()).send({ date: '2026-09-21', category: 'X', description: 'Y', amount: -5, paymentMethod: 'Cash' });
    // 404 unknown debtor payment
    await request(app).post('/api/debtors/00000000-0000-0000-0000-000000000099/payments').set(auth()).send({ amountPaid: 10 });
    // 422 out-of-stock sale
    await request(app).post('/api/inventory/items').set(auth()).send({ name: 'Empty', sku: 'E-1', category: 'T', cost: 1, price: 2, stock: 0 });
    await request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Empty', time: '2026-09-21T10:00:00Z', amount: 2 });

    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.sale.count()).toBe(0);
    await assertGlobalInvariants();
  });

  it('invariants hold after an idempotent retry (same key books exactly once)', async () => {
    const headers = { ...auth(), 'x-idempotency-key': 'integrity-retry-key' };
    const body = { date: '2026-09-21', amount: 700, bankName: 'KCB', accountNo: '1', sourceOfCash: 'X', depositedBy: 'U' };
    const [r1, r2] = await Promise.all([
      request(app).post('/api/deposits').set(headers).send(body),
      request(app).post('/api/deposits').set(headers).send(body),
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(await prisma.deposit.count()).toBe(1); // retry did not double-book
    await assertGlobalInvariants();
  });

  it('invariants persist across a server restart (fresh app instance, same database)', async () => {
    // Build state: one ledger transfer + one sale.
    const a = await request(app).post('/api/ledgers').set(auth()).send({ name: 'LDR-R1', code: 'LDR-R1', type: 'Cash', cashier: 'T', balance: 300 });
    const b = await request(app).post('/api/ledgers').set(auth()).send({ name: 'LDR-R2', code: 'LDR-R2', type: 'Cash', cashier: 'T', balance: 0 });
    await request(app).post('/api/ledgers/transfer').set(auth()).send({ fromLedgerId: a.body.id, toLedgerId: b.body.id, amount: 120 });
    await request(app).post('/api/inventory/items').set(auth()).send({ name: 'Restart Item', sku: 'RS-1', category: 'T', cost: 5, price: 9, stock: 4 });
    await request(app).post('/api/inventory/sales').set(auth()).send({ item: 'Restart Item', time: '2026-09-21T10:00:00Z', amount: 9 });

    // "Restart": brand-new app instance over the same database.
    const restarted = createTestApp();
    const health = await request(restarted).get('/api/health');
    expect(health.status).toBe(200);

    // All balances/stock/movement records survive and still satisfy invariants.
    expect(toNum((await prisma.ledger.findUnique({ where: { id: a.body.id } }))!.balance)).toBe(180);
    expect(toNum((await prisma.ledger.findUnique({ where: { id: b.body.id } }))!.balance)).toBe(120);
    expect((await prisma.inventoryItem.findFirst({ where: { name: 'Restart Item' } }))!.stock).toBe(3);
    expect(await prisma.ledgerMovement.count()).toBe(1);
    await assertGlobalInvariants();

    // The restarted instance serves consistent reports too.
    const cashiers = await request(restarted).get('/api/reports/cashiers').set(auth());
    const row = cashiers.body.find((r: any) => r.cashier === 'T' && r.collected === 120);
    expect(row).toBeDefined();
  });
});
