/**
 * CRUD battery shared by PATH A and PATH B acceptance runs.
 * Env: ACCEPTANCE_BASE (default http://localhost:5010/api), ACCEPTANCE_TOKEN (required).
 * Expects an authenticated super_admin token; verifies the same CRUD checks on
 * both installation paths so the comparison is like-for-like.
 */
const BASE = process.env.ACCEPTANCE_BASE || 'http://localhost:5010/api';
const TOKEN = process.env.ACCEPTANCE_TOKEN;
if (!TOKEN) { console.error('ACCEPTANCE_TOKEN required'); process.exit(2); }
const results = [];
const ck = (name, pass, extra = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${pass ? '' : ' — ' + extra}`);
};
const api = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};
const uniq = Date.now().toString(36).slice(-6);

// Christian CRUD
const cr = await api('POST', '/christians', {
  nationalId: `ID-${uniq}`, baptismalName: 'Grace', secondName: 'Wanjiku', sirName: `Kamau${uniq}`,
  phone: `+25470${uniq}`, diocese: 'Nairobi', parish: 'St. Peter', localChurch: 'Main', scc: 'SCC A',
});
ck('christian CREATE: 201 + regNo', cr.status === 201 && /^REG-\d{4}-\d{6}$/.test(cr.json?.regNo ?? ''), JSON.stringify(cr.json));
const CID = cr.json?.id;
const up = await api('PUT', `/christians/${CID}`, { phone: `+25470999${uniq}` });
ck('christian UPDATE persists', up.status === 200 && up.json?.phone === `+25470999${uniq}`);
const list = await api('GET', '/christians');
ck('christian LIST contains record', Array.isArray(list.json) && list.json.some((c) => c.id === CID));

// Finance: deposit + dashboard delta
const amt = 1000 + (Date.now() % 100000);
const dashBefore = await api('GET', '/dashboard/summary');
const dep = await api('POST', '/deposits', {
  date: '2026-09-21', amount: amt, bankName: 'KCB', accountNo: '111',
  sourceOfCash: 'Acceptance run', depositedBy: 'Treasurer',
});
ck('deposit CREATE: 201 + DEP-#####', dep.status === 201 && /^DEP-\d{5}$/.test(dep.json?.refNo ?? ''), JSON.stringify(dep.json));
const dashAfter = await api('GET', '/dashboard/summary');
ck('dashboard totalDeposits delta exact', dashAfter.json?.totalDeposits === dashBefore.json?.totalDeposits + amt);

// Inventory: create → sell → decrement
const stock0 = 5;
await api('POST', '/inventory/items', {
  name: `Acceptance Item ${uniq}`, sku: `ACC-${uniq}`, category: 'Test', cost: 100, price: 250, stock: stock0,
});
const sale = await api('POST', '/inventory/sales', { item: `Acceptance Item ${uniq}`, time: new Date().toISOString(), amount: 250 });
ck('sale recorded', sale.status === 201, JSON.stringify(sale.json));
const items = await api('GET', '/inventory/items');
const stockNow = items.json?.find((i) => i.name === `Acceptance Item ${uniq}`)?.stock;
ck(`stock ${stock0}→${stock0 - 1}`, stockNow === stock0 - 1, `got ${stockNow}`);

// Reports parity check (same endpoint contract on both paths)
const cashiers = await api('GET', '/reports/cashiers');
ck('reports/cashiers shape', Array.isArray(cashiers.json) && cashiers.json.every((r) => 'cashier' in r && 'collected' in r));

const passed = results.filter(Boolean).length;
console.log(`\n═══════ CRUD battery: ${passed} passed, ${results.length - passed} failed ═══════`);
process.exit(passed === results.length ? 0 : 1);
