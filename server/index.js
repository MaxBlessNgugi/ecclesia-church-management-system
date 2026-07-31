/**
 * Ecclesia — Reference REST API
 * ==============================
 * A working Express backend that implements the full contract in `API.md`.
 * It uses an in-memory store seeded with the same data as `src/data/mockData.ts`,
 * so the frontend can be pointed at it immediately.
 *
 * The backend developer should replace the in-memory store with a real database
 * (PostgreSQL / MySQL / Mongo) and add proper authentication + persistence.
 * Endpoint paths and JSON shapes MUST stay in sync with `API.md` and
 * `src/services/api.ts`.
 *
 * Run:  npm run server        (PORT defaults to 5000, override with env PORT)
 *       npm run dev           (Vite dev server proxies /api -> localhost:5000)
 */

import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const app = express();

// ---------------------------------------------------------------------------
// In-memory store (seed data mirrors src/data/mockData.ts + view initial state)
// ---------------------------------------------------------------------------
const db = {
  christians: [
    {
      id: 'c1',
      regNo: 'REG-2026-001042',
      nationalId: '12345678',
      baptismalName: 'Maria',
      secondName: 'Magdalene',
      sirName: 'Smith',
      phone: '+254 700 000 000',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'Our Lady of Sorrows',
      scc: 'St. Jude',
      status: 'Active',
      baptism: { date: '2010-04-15', minister: 'Rev. Fr. Joseph', place: "St. Mary's Parish" },
      eucharist: { date: '2012-05-20', minister: 'Rev. Fr. Thomas', place: "St. Mary's Parish" },
      confirmation: {
        date: '2016-10-12',
        minister: 'His Lordship Bishop Paul',
        place: 'Cathedral of St. Peter'
      },
      marriage: { date: '', minister: '', place: '' }
    },
    {
      id: 'c2',
      regNo: 'REG-2026-001043',
      nationalId: '23456789',
      baptismalName: 'Arthur',
      secondName: 'P.',
      sirName: 'Jenkins',
      phone: '+254 711 222 333',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'Our Lady of Sorrows',
      scc: 'St. Francis',
      status: 'Deceased',
      baptism: { date: '1965-02-10', minister: 'Rev. Fr. Michael', place: "St. Mary's Parish" }
    },
    {
      id: 'c3',
      regNo: 'REG-2026-001044',
      nationalId: '34567890',
      baptismalName: 'Martha',
      secondName: 'Rose',
      sirName: 'Willoughby',
      phone: '+254 722 333 444',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'St. Peters Center',
      scc: 'St. Anne',
      status: 'Deceased'
    },
    {
      id: 'c4',
      regNo: 'REG-2026-001045',
      nationalId: '45678901',
      baptismalName: 'Adrian',
      secondName: '',
      sirName: 'Thorne',
      phone: '+254 733 444 555',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'Our Lady of Sorrows',
      scc: 'St. Jude',
      status: 'Active'
    },
    {
      id: 'c5',
      regNo: 'REG-2026-001046',
      nationalId: '56789012',
      baptismalName: 'Cecilia',
      secondName: '',
      sirName: 'Vance',
      phone: '+254 744 555 666',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'St. Peters Center',
      scc: 'St. Francis',
      status: 'Active'
    },
    {
      id: 'c6',
      regNo: 'REG-2026-001047',
      nationalId: '67890123',
      baptismalName: 'Elias',
      secondName: '',
      sirName: 'Graves',
      phone: '+254 755 666 777',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'Our Lady of Sorrows',
      scc: 'St. Anne',
      status: 'Active'
    },
    {
      id: 'c7',
      regNo: 'REG-2026-001048',
      nationalId: '78901234',
      baptismalName: 'Julianne',
      secondName: '',
      sirName: 'Sterling',
      phone: '+254 766 777 888',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'St. Peters Center',
      scc: 'St. Jude',
      status: 'Active'
    },
    {
      id: 'c8',
      regNo: 'REG-2026-001049',
      nationalId: '89012345',
      baptismalName: 'Victor',
      secondName: 'Saint',
      sirName: 'Clair',
      phone: '+254 777 888 999',
      diocese: 'Archdiocese of Nairobi',
      parish: "St. Mary's Parish",
      localChurch: 'Our Lady of Sorrows',
      scc: 'St. Francis',
      status: 'Active'
    }
  ],
  creditors: [
    {
      id: 'cr1',
      vendor: 'Liturgical Arts & Supply',
      description: 'Sanctuary Maintenance',
      invoiceNo: '#INV-2024-081',
      amountOwed: 12400,
      dueDate: 'Oct 12, 2024',
      status: 'Pending'
    },
    {
      id: 'cr2',
      vendor: 'Beacon Structural Eng.',
      description: 'Roof Restoration',
      invoiceNo: '#BE-9942',
      amountOwed: 28500,
      dueDate: 'Sep 28, 2024',
      status: 'Overdue'
    },
    {
      id: 'cr3',
      vendor: 'Evergreen Landscaping',
      description: 'Groundskeeping Monthly',
      invoiceNo: '#EL-0122',
      amountOwed: 1950,
      dueDate: 'Oct 30, 2024',
      status: 'Scheduled'
    }
  ],
  debtors: [
    { id: 'db1', memberName: 'Adrian Thorne', contributionType: 'Monthly Tithe', amount: 450, status: 'Outstanding' },
    { id: 'db2', memberName: 'Cecilia Vance', contributionType: 'Building Fund', amount: 1200, status: 'Partially Paid' },
    { id: 'db3', memberName: 'Elias Graves', contributionType: 'Monthly Tithe', amount: 320, status: 'Paid' },
    { id: 'db4', memberName: 'Julianne Sterling', contributionType: 'Mission Pledge', amount: 75, status: 'Outstanding' },
    { id: 'db5', memberName: 'Victor Saint-Clair', contributionType: 'Monthly Tithe', amount: 2100, status: 'Outstanding' }
  ],
  deposits: [
    {
      id: 'dep1',
      date: '2024-05-18',
      amount: 3450,
      bankName: "St. Jude's Mercantile",
      accountNo: 'ac-9081',
      sourceOfCash: 'Weekly Mass Offerings',
      refNo: 'DEP-88391',
      depositedBy: 'Fr. Thomas'
    }
  ],
  expenses: [
    {
      id: 'exp1',
      date: '2024-05-20',
      category: 'Utilities',
      description: 'Altar Wine Supplies Ltd.',
      amount: 450,
      paymentMethod: 'Check / Voucher',
      voucherNo: 'VCH-2024-001'
    }
  ],
  deaths: [
    {
      id: 'd1',
      christianId: 'c2',
      memberName: 'Arthur P. Jenkins',
      placeOfDeath: 'St. Jude Medical Center',
      dateOfDeath: '2023-10-08',
      dateOfBurial: 'Oct 12, 2023',
      ministerName: 'Fr. Thomas',
      remarks: 'Requiem Mass celebrated with family'
    },
    {
      id: 'd2',
      christianId: 'c3',
      memberName: 'Martha Rose Willoughby',
      placeOfDeath: 'Parish Hospice',
      dateOfDeath: '2023-09-24',
      dateOfBurial: 'Sep 28, 2023',
      ministerName: 'Fr. Thomas',
      remarks: 'Buried in St. Mary Parish Cemetery'
    }
  ],
  contributions: [
    {
      id: 'con1',
      christianId: 'c1',
      memberName: 'Maria Magdalene Smith',
      regNo: 'REG-2026-001042',
      categories: ['10% Tithing'],
      monthlyTracker: { JAN: true, FEB: true, MAR: true, APR: false, MAY: true, JUN: false },
      amountKES: 1500,
      date: '2026-07-15'
    }
  ],
  transfers: [],
  billedItems: [
    {
      id: 'b1',
      christianId: 'c5',
      memberName: 'Cecilia Vance',
      isWalkIn: false,
      category: 'Certificates',
      item: 'Baptismal Certificate',
      unitFee: 200,
      quantity: 1,
      totalAmount: 200,
      date: '2026-07-10'
    }
  ],
  employees: [
    { id: 'emp1', code: 'EMP001', name: 'Fr. Mark Davis', role: 'Parish Priest', phone: '+254 700 000123', email: 'fr.mark@stmarys.org', hireDate: '2019-03-15' },
    { id: 'emp2', code: 'EMP002', name: 'Sarah Jenkins', role: 'Head Cashier', phone: '+254 700 000124', email: 's.jenkins@stmarys.org', hireDate: '2021-06-01' },
    { id: 'emp3', code: 'EMP003', name: 'Peter Njuguna', role: 'Inventory Clerk', phone: '+254 700 000125', email: 'p.njuguna@stmarys.org', hireDate: '2022-01-10' },
    { id: 'emp4', code: 'EMP004', name: 'Sr. Beatrice', role: 'Pastoral Coordinator', phone: '+254 700 000126', email: 'sr.beatrice@stmarys.org', hireDate: '2020-09-20' },
    { id: 'emp5', code: 'EMP005', name: 'John Kamau', role: 'Sacristan', phone: '+254 700 000127', email: 'j.kamau@stmarys.org', hireDate: '2023-04-12' }
  ],
  inventoryItems: [
    { id: '1', name: 'Altar Wine (Reserve Premium)', sku: 'LIT-044', category: 'Liturgical Supplies', cost: 12.5, price: 18, stock: 42, reorder: 24 },
    { id: '2', name: 'Beeswax Altar Candles (12")', sku: 'LIT-001', category: 'Liturgical Supplies', cost: 8, price: 12, stock: 140, reorder: 30 },
    { id: '3', name: 'Communion Wafers (Pack 500)', sku: 'LIT-012', category: 'Sacramental', cost: 15, price: 25, stock: 9, reorder: 5 },
    { id: '4', name: 'Incense Charcoal (Rolls)', sku: 'SUP-089', category: 'Liturgical Supplies', cost: 4, price: 7.5, stock: 60, reorder: 15 },
    { id: '5', name: 'Sunday Missal 2024', sku: 'BK-101', category: 'Books', cost: 10, price: 15, stock: 110, reorder: 20 },
    { id: '6', name: 'Certificate Issuance', sku: 'SRV-001', category: 'Sacramental Documents', cost: 0, price: 15, stock: 999, reorder: 0 }
  ],
  deliveries: [
    { id: 'd1', supplier: 'Sacramental Wine Co.', inv: '#SW-9921', date: 'Oct 24, 2023', units: 12, cat: 'Liturgy Supplies', total: 144 },
    { id: 'd2', supplier: 'Vesper Candle Works', inv: '#VC-4402', date: 'Oct 22, 2023', units: 50, cat: 'Altar Candles', total: 250 },
    { id: 'd3', supplier: 'Grace Publishing', inv: '#GP-1109', date: 'Oct 20, 2023', units: 100, cat: 'Parish Bulletins', total: 85 }
  ],
  sales: [
    { id: 's1', item: 'Missal 2024', time: '09:15 AM • Cash', amount: 25 },
    { id: 's2', item: 'Baptismal Search', time: '10:42 AM • EFT', amount: 50 },
    { id: 's3', item: 'Votive Candles (x10)', time: 'Yesterday • Cash', amount: 15 }
  ],
  stockTakes: [
    { id: 'st1', name: 'Beeswax Altar Candles (12")', sku: 'LIT-001', system: 142, physical: 140, notes: '' },
    { id: 'st2', name: 'Sacramental Wine (750ml)', sku: 'LIT-044', system: 24, physical: 24, notes: '' },
    { id: 'st3', name: 'Communion Wafers (Pack 500)', sku: 'LIT-012', system: 8, physical: 9, notes: 'Found unrecorded box in vestry' },
    { id: 'st4', name: 'Incense Charcoal (Rolls)', sku: 'SUP-089', system: 60, physical: 60, notes: '' }
  ],
  issues: [
    { id: 'i1', item: '6x Altar Wine', dest: 'To: Main Sacristy • Liturgical Use' },
    { id: 'i2', item: '12x Loaves (Artisanal)', dest: 'To: Parish Outreach • Donation' }
  ],
  ledgers: [
    { id: '1', name: 'Parish Main Cash', code: 'LDR-101', type: 'Asset', cashier: 'Mary Magdalene', balance: 12450 },
    { id: '2', name: 'Weekly Tithes', code: 'LDR-205', type: 'Revenue', cashier: 'Peter Fisher', balance: 8920 },
    { id: '3', name: 'Youth Outreach Fund', code: 'LDR-310', type: 'Petty Cash', cashier: 'John Beloved', balance: 1200 },
    { id: '4', name: 'Emergency Repair', code: 'LDR-99', type: 'Asset', cashier: 'Mary Magdalene', balance: 2850 },
    { id: '5', name: 'Liturgical Maintenance', code: 'LDR-402', type: 'Expense', cashier: 'Sarah Jenkins', balance: 3400 }
  ],
  movements: [
    { id: 'm1', amount: 1200, time: 'Today, 09:12 AM', from: 'Gen. Fund', to: 'Maintenance' },
    { id: 'm2', amount: 5500, time: 'Yesterday', from: 'Donations', to: 'Restoration' },
    { id: 'm3', amount: 450, time: '22 Oct', from: 'Petty Cash', to: 'Office Supp.' }
  ],
  rights: {
    panels: {
      christian: true,
      activities: true,
      sacraments: true,
      finance: false,
      ledgers: false,
      inventory: true,
      reports: true,
      hr: false,
      administration: true
    },
    actions: { view: true, edit: true, delete: false }
  },
  pushPayments: {
    paybill: '522522',
    accountFormat: 'ST MARYS PARISH TITHE',
    consumerKey: 'ck_live_992184019284012',
    consumerSecret: 'cs_live_449201948201948',
    testPhone: '254700000000',
    testAmount: '100'
  }
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  next();
});

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
const ok = (res, data) => res.json(data);
const created = (res, data) => res.status(201).json(data);
const notFound = (res, id) => res.status(404).json({ error: `Record ${id} not found` });

const listHandler = (collection) => (_req, res) => ok(res, db[collection]);
const createHandler = (collection) => (req, res) => {
  const record = { id: randomUUID(), ...req.body };
  db[collection].unshift(record);
  return created(res, record);
};

// ---------------------------------------------------------------------------
// Auth (reference stub — replace with real auth in production)
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  return ok(res, {
    token: `stub-token-${randomUUID()}`,
    user: { id: 'u1', name: 'Fr. Thomas', email, role: 'Parish Administrator' }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { email, name, role } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email is required' });
  return created(res, {
    token: `stub-token-${randomUUID()}`,
    user: { id: 'u1', name: name || 'User', email, role: role || 'Parish Administrator' }
  });
});

app.get('/api/auth/me', (_req, res) =>
  ok(res, { id: 'u1', name: 'Fr. Thomas', email: 'fr.thomas@stmarysparish.org', role: 'Parish Administrator' })
);

// ---------------------------------------------------------------------------
// Christians
// ---------------------------------------------------------------------------
app.get('/api/christians', (req, res) => {
  const { status, q } = req.query;
  let rows = db.christians;
  if (status) rows = rows.filter((c) => c.status === status);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((c) =>
      [c.baptismalName, c.secondName, c.sirName, c.regNo, c.nationalId, c.scc]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(needle))
    );
  }
  return ok(res, rows);
});

app.get('/api/christians/:id', (req, res) => {
  const row = db.christians.find((c) => c.id === req.params.id);
  return row ? ok(res, row) : notFound(res, req.params.id);
});

app.post('/api/christians', (req, res) => {
  const { baptismalName, sirName } = req.body ?? {};
  if (!baptismalName || !sirName) {
    return res.status(400).json({ error: 'baptismalName and sirName are required' });
  }
  const record = {
    id: randomUUID(),
    regNo: `REG-2026-${String(db.christians.length + 1042).padStart(6, '0')}`,
    status: 'Active',
    ...req.body,
    id: randomUUID()
  };
  db.christians.unshift(record);
  return created(res, record);
});

app.put('/api/christians/:id', (req, res) => {
  const idx = db.christians.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.christians[idx] = { ...db.christians[idx], ...req.body, id: req.params.id };
  return ok(res, db.christians[idx]);
});

app.patch('/api/christians/:id/sacraments', (req, res) => {
  const idx = db.christians.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  const allowed = ['baptism', 'eucharist', 'confirmation', 'marriage'];
  const patch = {};
  for (const key of allowed) if (req.body[key] !== undefined) patch[key] = req.body[key];
  db.christians[idx] = { ...db.christians[idx], ...patch, id: req.params.id };
  return ok(res, db.christians[idx]);
});

app.delete('/api/christians/:id', (req, res) => {
  const idx = db.christians.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.christians[idx] = { ...db.christians[idx], status: 'Inactive' };
  return res.status(204).end();
});

// ---------------------------------------------------------------------------
// Contributions / transfers / billed items / deaths
// ---------------------------------------------------------------------------
app.get('/api/contributions', listHandler('contributions'));
app.post('/api/contributions', createHandler('contributions'));
app.get('/api/transfers', listHandler('transfers'));
app.post('/api/transfers', createHandler('transfers'));
app.get('/api/billed-items', listHandler('billedItems'));
app.post('/api/billed-items', createHandler('billedItems'));
app.get('/api/deaths', listHandler('deaths'));
app.post('/api/deaths', createHandler('deaths'));

// ---------------------------------------------------------------------------
// Finance: deposits / creditors / debtors / expenses
// ---------------------------------------------------------------------------
app.get('/api/deposits', listHandler('deposits'));
app.post('/api/deposits', createHandler('deposits'));

app.get('/api/creditors', listHandler('creditors'));
app.post('/api/creditors', createHandler('creditors'));
app.put('/api/creditors/:id', (req, res) => {
  const idx = db.creditors.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.creditors[idx] = { ...db.creditors[idx], ...req.body, id: req.params.id };
  return ok(res, db.creditors[idx]);
});
app.patch('/api/creditors/:id/paid', (req, res) => {
  const idx = db.creditors.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.creditors[idx] = { ...db.creditors[idx], status: 'Paid', id: req.params.id };
  return ok(res, db.creditors[idx]);
});

app.get('/api/debtors', listHandler('debtors'));
app.post('/api/debtors', createHandler('debtors'));
app.post('/api/debtors/:id/payments', (req, res) => {
  const idx = db.debtors.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  const amountPaid = Number(req.body?.amountPaid ?? 0);
  if (amountPaid <= 0) return res.status(400).json({ error: 'amountPaid must be > 0' });
  const remaining = Math.max(0, db.debtors[idx].amount - amountPaid);
  db.debtors[idx] = {
    ...db.debtors[idx],
    amount: remaining,
    status: remaining <= 0 ? 'Paid' : 'Partially Paid',
    id: req.params.id
  };
  return ok(res, db.debtors[idx]);
});

app.get('/api/expenses', listHandler('expenses'));
app.post('/api/expenses', createHandler('expenses'));

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------
app.get('/api/ledgers', listHandler('ledgers'));
app.post('/api/ledgers', createHandler('ledgers'));
app.get('/api/ledgers/movements', listHandler('movements'));
app.post('/api/ledgers/transfer', (req, res) => {
  const { fromLedgerId, toLedgerId, amount, notes } = req.body ?? {};
  const amt = Number(amount);
  const from = db.ledgers.find((l) => l.id === fromLedgerId);
  const to = db.ledgers.find((l) => l.id === toLedgerId);
  if (!from || !to) return res.status(404).json({ error: 'source or destination ledger not found' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (from.balance < amt) return res.status(422).json({ error: 'insufficient balance in source ledger' });
  from.balance -= amt;
  to.balance += amt;
  const movement = {
    id: randomUUID(),
    amount: amt,
    time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    from: from.name,
    to: to.name,
    notes: notes ?? ''
  };
  db.movements.unshift(movement);
  return created(res, movement);
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
app.get('/api/inventory/items', listHandler('inventoryItems'));
app.post('/api/inventory/items', createHandler('inventoryItems'));
app.put('/api/inventory/items/:id', (req, res) => {
  const idx = db.inventoryItems.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.inventoryItems[idx] = { ...db.inventoryItems[idx], ...req.body, id: req.params.id };
  return ok(res, db.inventoryItems[idx]);
});
app.delete('/api/inventory/items/:id', (req, res) => {
  const idx = db.inventoryItems.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.inventoryItems.splice(idx, 1);
  return res.status(204).end();
});

app.get('/api/inventory/deliveries', listHandler('deliveries'));
app.post('/api/inventory/deliveries', createHandler('deliveries'));
app.get('/api/inventory/sales', listHandler('sales'));
app.post('/api/inventory/sales', createHandler('sales'));
app.get('/api/inventory/stock-takes', listHandler('stockTakes'));
app.post('/api/inventory/stock-takes', createHandler('stockTakes'));
app.patch('/api/inventory/stock-takes/:id/physical', (req, res) => {
  const idx = db.stockTakes.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.stockTakes[idx] = { ...db.stockTakes[idx], physical: Number(req.body?.physical), id: req.params.id };
  return ok(res, db.stockTakes[idx]);
});
app.get('/api/inventory/issues', listHandler('issues'));
app.post('/api/inventory/issues', createHandler('issues'));

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------
app.get('/api/hr/employees', listHandler('employees'));
app.post('/api/hr/employees', (req, res) => {
  const { surname, firstName } = req.body ?? {};
  if (!surname || !firstName) return res.status(400).json({ error: 'surname and firstName are required' });
  const record = {
    id: randomUUID(),
    code: `EMP${String(db.employees.length + 1).padStart(3, '0')}`,
    name: `${firstName} ${surname}`,
    role: req.body.designation || 'Staff',
    phone: req.body.phone || '+254 700 000000',
    email: req.body.email || `${firstName.toLowerCase()}@stmarys.org`,
    hireDate: req.body.hireDate || new Date().toISOString().slice(0, 10)
  };
  db.employees.unshift(record);
  return created(res, record);
});
app.put('/api/hr/employees/:id', (req, res) => {
  const idx = db.employees.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return notFound(res, req.params.id);
  db.employees[idx] = { ...db.employees[idx], ...req.body, id: req.params.id };
  return ok(res, db.employees[idx]);
});

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------
app.get('/api/admin/rights', (_req, res) => ok(res, db.rights));
app.put('/api/admin/rights', (req, res) => {
  db.rights = req.body;
  return ok(res, db.rights);
});
app.get('/api/admin/push-payments', (_req, res) => ok(res, db.pushPayments));
app.put('/api/admin/push-payments', (req, res) => {
  db.pushPayments = req.body;
  return ok(res, db.pushPayments);
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
app.get('/api/reports/sacraments', (_req, res) =>
  ok(res, [
    { name: 'Adrian K. Wanjala', dob: '14/05/2012', date: '22/10/2023', scc: 'St. Jude SCC', status: 'Verified' },
    { name: 'Maria T. Otieno', dob: '03/11/2015', date: '22/10/2023', scc: 'St. Monica SCC', status: 'Verified' },
    { name: 'Benedict J. Kamau', dob: '28/01/2018', date: '15/09/2023', scc: 'St. Anne SCC', status: 'Verified' },
    { name: 'Catherine N. Musyoka', dob: '19/08/2020', date: '15/09/2023', scc: 'St. Paul SCC', status: 'Pending' },
    { name: 'Paul L. Gachora', dob: '02/04/2021', date: '01/08/2023', scc: 'St. Jude SCC', status: 'Verified' }
  ])
);

app.get('/api/reports/contributions', (_req, res) =>
  ok(res, db.contributions.map((c) => ({
    memberName: c.memberName,
    category: c.categories[0] ?? '10% Tithing',
    month: c.date.slice(0, 7),
    amount: c.amountKES,
    status: 'Collected'
  })))
);

app.get('/api/reports/sales', (_req, res) =>
  ok(res, db.sales.map((s) => ({ item: s.item, quantity: 1, amount: s.amount, date: s.time })))
);

app.get('/api/reports/cashiers', (_req, res) =>
  ok(res, [
    { cashier: 'Sarah Jenkins', sessions: 14, collected: 48200, reconciled: 48150, status: 'Balanced' },
    { cashier: 'Mary Magdalene', sessions: 12, collected: 39500, reconciled: 39500, status: 'Balanced' },
    { cashier: 'John Beloved', sessions: 9, collected: 21150, reconciled: 20990, status: 'Variance' }
  ])
);

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------
app.get('/api/dashboard/summary', (_req, res) =>
  ok(res, {
    activeMembers: db.christians.filter((c) => c.status === 'Active').length,
    totalChristians: db.christians.length,
    totalDeposits: db.deposits.reduce((s, d) => s + d.amount, 0),
    totalExpenses: db.expenses.reduce((s, e) => s + e.amount, 0),
    pendingCreditors: db.creditors.filter((c) => c.status !== 'Paid').length,
    outstandingDebtors: db.debtors.filter((d) => d.status !== 'Paid').length,
    lowStockItems: db.inventoryItems.filter((i) => i.stock <= i.reorder).length,
    totalEmployees: db.employees.length,
    recentDeposits: db.deposits.slice(0, 5),
    recentExpenses: db.expenses.slice(0, 5)
  })
);

// ---------------------------------------------------------------------------
// Health / fallbacks
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Ecclesia reference API listening on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
