/**
 * PATH A acceptance battery — native install (clean tree, port 5010).
 * IDEMPOTENT: safe to re-run against a live server. Expectations are computed
 * from current state (deltas, unique suffixes, admin:reset-minted passwords) —
 * never from hard-coded records. Run: node acceptance-evidence/path-a-battery.mjs
 */
const BASE = process.env.ACCEPTANCE_BASE || 'http://localhost:5010/api';
const results = [];
const ck = (name, pass, extra = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${pass ? '' : ' — ' + extra}`);
};
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};
const uniq = Date.now().toString(36).slice(-6);

// ── 0. Reset primary admin via the documented recovery CLI (idempotent seed) ─
const { execSync } = await import('node:child_process');
const BE = process.env.ACCEPTANCE_BACKEND || 'backend';
const resetOut = execSync(
  `npx tsx scripts/reset-admin-password.ts maxblessngugi@ecclesia.local`,
  { cwd: BE, env: { ...process.env }, encoding: 'utf8' },
);
const primaryPw = resetOut.match(/Temporary password:\s*(\S+)/)?.[1];
ck('admin:reset mints a temporary password', Boolean(primaryPw));

// ── 1. Health ────────────────────────────────────────────────────────────────
const health = await api('GET', '/health');
ck('health: ok + db connected', health.json?.status === 'ok' && health.json?.db === 'connected', JSON.stringify(health.json));

// ── 2. Login (forced password change on first sign-in) ──────────────────────
const login = await api('POST', '/auth/login', { body: { email: 'maxblessngugi@ecclesia.local', password: primaryPw } });
ck('seeded super_admin login returns token', login.status === 200 && Boolean(login.json?.token), JSON.stringify(login.json));
ck('first login forces password change', login.json?.user?.mustChangePassword === true);
let T1 = login.json?.token;

// ── 3. Change password (rotates token, invalidates old one) ─────────────────
const newPw = `Acceptance#${uniq}!x`.replace(/[^!-~]/g, '') + 'A1!';
const changed = await api('PUT', '/auth/change-password', { token: T1, body: { currentPassword: primaryPw, newPassword: newPw } });
ck('change-password succeeds and rotates token', changed.status === 200 && Boolean(changed.json?.token), JSON.stringify(changed.json));
T1 = changed.json?.token ?? T1;
const oldLogin = await api('POST', '/auth/login', { body: { email: 'maxblessngugi@ecclesia.local', password: primaryPw } });
ck('old password rejected after change', oldLogin.status === 401);

// ── 4. Christian CRUD ────────────────────────────────────────────────────────
const cr = await api('POST', '/christians', { token: T1, body: {
  nationalId: `ID-${uniq}`, baptismalName: 'Grace', secondName: 'Wanjiku', sirName: `Kamau${uniq}`,
  phone: `+25470${uniq}`, diocese: 'Nairobi', parish: 'St. Peter', localChurch: 'Main', scc: 'SCC A',
} });
ck('christian CREATE: 201 + server-generated regNo', cr.status === 201 && /^REG-\d{4}-\d{6}$/.test(cr.json?.regNo ?? ''), JSON.stringify(cr.json));
const CID = cr.json?.id;
const list = await api('GET', '/christians', { token: T1 });
ck('christian LIST contains the new record', Array.isArray(list.json) && list.json.some((c) => c.id === CID));
const up = await api('PUT', `/christians/${CID}`, { token: T1, body: { phone: `+25470999${uniq}` } });
ck('christian UPDATE persists', up.status === 200 && up.json?.phone === `+25470999${uniq}`, JSON.stringify(up.json?.phone));

// ── 5. Finance: deposit + dashboard delta ────────────────────────────────────
const amt = 1000 + (Date.now() % 100000); // purely numeric — JSON cannot carry NaN
const dashBefore = await api('GET', '/dashboard/summary', { token: T1 });
const dep = await api('POST', '/deposits', { token: T1, body: {
  date: '2026-09-21', amount: amt, bankName: 'KCB', accountNo: '111',
  sourceOfCash: 'Acceptance run', depositedBy: 'Treasurer',
} });
ck('deposit CREATE: 201 + auto refNo DEP-#####', dep.status === 201 && /^DEP-\d{5}$/.test(dep.json?.refNo ?? ''), JSON.stringify(dep.json));
const dashAfter = await api('GET', '/dashboard/summary', { token: T1 });
ck(`dashboard totalDeposits increased by exactly ${amt}`,
  dashAfter.json?.totalDeposits === dashBefore.json?.totalDeposits + amt,
  `${dashBefore.json?.totalDeposits} → ${dashAfter.json?.totalDeposits}`);

// ── 6. Inventory: create → sell → atomic decrement ───────────────────────────
const stock0 = 5;
const item = await api('POST', '/inventory/items', { token: T1, body: {
  name: `Acceptance Item ${uniq}`, sku: `ACC-${uniq}`, category: 'Test', cost: 100, price: 250, stock: stock0,
} });
ck('inventory item CREATE', item.status === 201 && item.json?.stock === stock0);
const sale = await api('POST', '/inventory/sales', { token: T1, body: {
  item: `Acceptance Item ${uniq}`, time: new Date().toISOString(), amount: 250,
} });
ck('sale recorded', sale.status === 201, JSON.stringify(sale.json));
const items = await api('GET', '/inventory/items', { token: T1 });
const stockNow = items.json?.find((i) => i.name === `Acceptance Item ${uniq}`)?.stock;
ck(`stock decremented atomically ${stock0}→${stock0 - 1}`, stockNow === stock0 - 1, `got ${stockNow}`);

// ── 7. Multi-user access control ─────────────────────────────────────────────
const admin2 = execSync(
  `npx tsx scripts/reset-admin-password.ts "josephndung'u@ecclesia.local"`,
  { cwd: BE, env: { ...process.env }, encoding: 'utf8' },
).match(/Temporary password:\s*(\S+)/)?.[1];
const login2 = await api('POST', '/auth/login', { body: { email: "josephndung'u@ecclesia.local", password: admin2 } });
ck('second seeded admin logs in', login2.status === 200 && Boolean(login2.json?.token));
await api('PUT', '/auth/change-password', { token: login2.json?.token, body: { currentPassword: admin2, newPassword: `Second#${uniq}!x` } });

const staffEmail = `staff-${uniq}@ecclesia.local`;
const reg = await api('POST', '/auth/register', { token: T1, body: { email: staffEmail, password: `Staff#${uniq}!x`, name: 'Parish Staff', role: 'staff' } });
ck('super_admin registers staff user', reg.status === 201 && reg.json?.user?.role === 'staff', JSON.stringify(reg.json));
const T3 = reg.json?.token;
const denied = await api('POST', '/auth/register', { token: T3, body: { email: `x-${uniq}@ecclesia.local`, password: `Xx#${uniq}!xyz`, name: 'Nope', role: 'staff' } });
ck('staff CANNOT register users (403)', denied.status === 403, JSON.stringify(denied.json));

const passed = results.filter(Boolean).length;
console.log(`\n═══════ PATH A battery: ${passed} passed, ${results.length - passed} failed ═══════`);
process.exit(passed === results.length ? 0 : 1);
