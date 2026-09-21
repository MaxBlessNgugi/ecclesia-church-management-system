/**
 * ECCLESIA CHMS — Money-path E2E tests (audit P1.3)
 *
 * The visual tour demonstrates the app; these tests ASSERT each money flow
 * end to end through the real UI and verify the write landed via the API:
 *
 *   1. Login → record a member contribution
 *   2. Login → execute an inter-ledger transfer (balances + movement feed)
 *   3. Login → create a payroll entry, approve it, mark it paid
 *
 * Fixtures (a member, two ledgers, one employee) are created through the real
 * REST API in beforeAll with a run-unique suffix, so repeated runs against the
 * same database never collide and assertions stay precise.
 *
 * Accounts come from `backend/scripts/seed-e2e.ts` (admin@ecclesia.local /
 * Admin123!), the same accounts the CI e2e job seeds. Override with
 * E2E_EMAIL / E2E_PASSWORD when running against a different deployment.
 *
 *   npm run test:e2e            — full headless run (CI)
 *   npx playwright test tests/money-path.spec.ts --project=fast
 */
import { test, expect } from '../console-capture';
import { Page, APIRequestContext, request as pwRequest } from '@playwright/test';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';

const ADMIN = {
  email: process.env.E2E_EMAIL || 'admin@ecclesia.local',
  password: process.env.E2E_PASSWORD || 'Admin123!',
} as const;

// Run-unique suffix so fixtures never collide across local runs.
const RUN = Date.now().toString(36).toLowerCase();
const MEMBER = {
  baptismalName: 'Zuri',
  secondName: 'Flow',
  sirName: `E2E${RUN}`,
  nationalId: `9${String(Date.now()).slice(-8)}`,
  phone: '0700112233',
};
const SOURCE_LEDGER = { name: `E2E Source ${RUN}`, code: `E2E-A-${RUN}`, type: 'Bank' };
const DEST_LEDGER = { name: `E2E Dest ${RUN}`, code: `E2E-B-${RUN}`, type: 'Bank' };

/** Assert a 2xx API response and return its parsed JSON, or throw with the body. */
async function expectJson<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<T> }, label: string): Promise<T> {
  if (res.status() >= 200 && res.status() < 300) return (await res.json()) as T;
  throw new Error(`${label} failed with ${res.status()}: ${await res.text()}`);
}
const EMPLOYEE = {
  surname: 'Flow',
  firstName: 'Payroll',
  middleName: `E2E${RUN}`,
  designation: 'Catechist',
  email: `payroll-${RUN}@e2e.local`,
  phone: '0711223344',
};

const CONTRIBUTION_AMOUNT = 5000;
const TRANSFER_AMOUNT = 2500;
const SOURCE_START_BALANCE = 50000;
// Net pay is made run-unique so the final "exactly one row" sanity check also
// holds when the spec is re-run against a database that kept earlier fixtures.
const PAYROLL_OFFSET = Date.now() % 9000;
const PAYROLL = {
  basicSalary: 10000 + PAYROLL_OFFSET,
  allowances: 2000,
  deductions: 1000,
  netPay: 11000 + PAYROLL_OFFSET,
  period: '2026-09',
};

// ─── Shared state filled by beforeAll ───────────────────────────────────────

let api: APIRequestContext;
let adminToken = '';
let memberId = '';
let memberFullName = '';
let sourceLedgerId = '';
let destLedgerId = '';
let employeeId = '';
let employeeName = '';

// ─── Small helpers ──────────────────────────────────────────────────────────

/** Log in via the API and return the JWT. */
async function apiLogin(email: string, password: string): Promise<string> {
  const res = await api.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `POST /api/auth/login → ${res.status()}`).toBe(200);
  const body = await res.json();
  return body.token as string;
}

/** Authed GET helper that fails loudly on non-2xx. */
async function apiGet<T>(path: string): Promise<T> {
  const res = await api.get(path, { headers: { Authorization: `Bearer ${adminToken}` } });
  expect(res.status(), `GET ${path} → ${res.status()}`).toBe(200);
  return (await res.json()) as T;
}

/** Poll an async predicate until it holds or the timeout expires. */
async function waitFor(
  label: string,
  predicate: () => Promise<boolean>,
  timeoutMs = 20_000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}${lastError ? ` (${String(lastError)})` : ''}`);
}

/** Sign in through the real login UI and wait for the app shell. */
async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#root > *', { timeout: 30_000 });
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in|login/i }).click();
  await page.waitForFunction(() => !!localStorage.getItem('ecclesia_token'), { timeout: 10_000 });
  await page.waitForSelector('main', { timeout: 15_000 });
}

/** Click a sidebar panel (e.g. Activities, Ledgers, HR), then an optional sub-tab. */
async function openPanel(page: Page, panel: RegExp, subTab?: RegExp): Promise<void> {
  await page.locator('aside button').filter({ hasText: panel }).first().click();
  await page.waitForTimeout(500);
  if (subTab) {
    await page.locator('main button, [role="tab"]').filter({ hasText: subTab }).first().click();
    await page.waitForTimeout(500);
  }
}

// ─── Fixture setup ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE_URL });
  adminToken = await apiLogin(ADMIN.email, ADMIN.password);

  // Member — server assigns the regNo.
  const member = await expectJson(
    await api.post('/api/christians', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        baptismalName: MEMBER.baptismalName,
        secondName: MEMBER.secondName,
        sirName: MEMBER.sirName,
        nationalId: MEMBER.nationalId,
        phone: MEMBER.phone,
        diocese: 'Nairobi Archdiocese',
        parish: 'Our Lady of Mercy',
        localChurch: 'St. Anne',
        scc: 'E2E SCC',
      },
    }),
    'create member',
  );
  memberId = member.id;
  memberFullName = `${member.baptismalName} ${member.secondName} ${member.sirName}`;

  // Two ledgers: a funded source and an empty destination. Explicit codes keep
  // the fixture independent of the server's auto-code generator.
  const sourceLedger = await expectJson(
    await api.post('/api/ledgers', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: SOURCE_LEDGER.name,
        code: SOURCE_LEDGER.code,
        type: SOURCE_LEDGER.type,
        cashier: 'E2E Cashier',
        balance: SOURCE_START_BALANCE,
      },
    }),
    'create source ledger',
  );
  sourceLedgerId = sourceLedger.id;

  const destLedger = await expectJson(
    await api.post('/api/ledgers', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: DEST_LEDGER.name,
        code: DEST_LEDGER.code,
        type: DEST_LEDGER.type,
        cashier: 'E2E Cashier',
        balance: 0,
      },
    }),
    'create dest ledger',
  );
  destLedgerId = destLedger.id;

  // One employee for the payroll leg.
  const employee = await expectJson(
    await api.post('/api/hr/employees', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        surname: EMPLOYEE.surname,
        firstName: EMPLOYEE.firstName,
        middleName: EMPLOYEE.middleName,
        designation: EMPLOYEE.designation,
        hireDate: '2024-01-15',
        email: EMPLOYEE.email,
        phone: EMPLOYEE.phone,
      },
    }),
    'create employee',
  );
  employeeId = employee.id;
  employeeName = employee.name;
});

test.afterAll(async () => {
  await api?.dispose().catch(() => undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// 1 — CONTRIBUTION: pick the member, record KES 5,000, verify via API
// ═══════════════════════════════════════════════════════════════════════════

test('record a member contribution and verify it persists', async ({ page }) => {
  test.setTimeout(90_000);
  await loginViaUI(page);

  // Activities opens on the Receive Payment sub-tab by default.
  await openPanel(page, /activities/i);
  await expect(page.locator('text=CONTRIBUTION MANAGEMENT')).toBeVisible({ timeout: 20_000 });

  // Pick the freshly created member via the live search picker.
  await page.locator('input[placeholder="Search parishioner..."]').fill(MEMBER.sirName);
  const dropdownRow = page.locator('button', { hasText: memberFullName }).first();
  await dropdownRow.click();

  // The member card should now show the selected member.
  await expect(page.locator('text=Selected for Payment')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('main')).toContainText(memberFullName);

  // Contribution categories default to "10% Tithing"; set the amount.
  const form = page.locator('form').filter({ hasText: 'Payment Amount (KES)' });
  await expect(form.getByText('10% Tithing', { exact: true })).toBeVisible();
  await form.locator('input[type="number"]').fill(String(CONTRIBUTION_AMOUNT));
  await form.getByRole('button', { name: /submit payment/i }).click();

  // Verify the write landed (UI posts async; poll the API).
  await waitFor('contribution to be recorded', async () => {
    const list = await apiGet<Array<{ christianId: string; memberName: string; amountKES: number; categories: string[] }>>(
      '/api/contributions',
    );
    return list.some(
      (c) =>
        c.christianId === memberId &&
        c.amountKES === CONTRIBUTION_AMOUNT &&
        c.categories.includes('10% Tithing'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 — LEDGER MOVEMENT: transfer KES 2,500 source → destination, verify balances
// ═══════════════════════════════════════════════════════════════════════════

test('move funds between ledgers and verify balances and movement feed', async ({ page }) => {
  test.setTimeout(90_000);
  await loginViaUI(page);
  await openPanel(page, /ledgers/i, /inter-ledger transfer/i);

  await expect(page.locator('h2', { hasText: 'Ledger Panel' })).toBeVisible({ timeout: 20_000 });

  const form = page.locator('form').filter({ hasText: 'Execute Fund Transfer' });
  await expect(form).toBeVisible();

  // Wait for the ledger list to load, then pick source/destination by name
  // (the selects carry the ledger NAME as option value).
  await expect(form.locator('select').nth(0).locator('option', { hasText: SOURCE_LEDGER.name })).toHaveCount(1, { timeout: 15_000 });
  await form.locator('select').nth(0).selectOption(SOURCE_LEDGER.name);
  await expect(form.locator('select').nth(1).locator('option', { hasText: DEST_LEDGER.name })).toHaveCount(1);
  await form.locator('select').nth(1).selectOption(DEST_LEDGER.name);
  await form.locator('input[type="number"]').fill(String(TRANSFER_AMOUNT));
  await form.locator('textarea').fill('Automated E2E inter-ledger transfer');
  await form.getByRole('button', { name: /execute fund transfer/i }).click();

  // Balances: source 50,000 → 47,500 ; destination 0 → 2,500.
  await waitFor('source ledger to be debited', async () => {
    const ledgers = await apiGet<Array<{ id: string; balance: number }>>('/api/ledgers');
    const src = ledgers.find((l) => l.id === sourceLedgerId);
    return src !== undefined && Number(src.balance) === SOURCE_START_BALANCE - TRANSFER_AMOUNT;
  });
  await waitFor('destination ledger to be credited', async () => {
    const ledgers = await apiGet<Array<{ id: string; balance: number }>>('/api/ledgers');
    const dest = ledgers.find((l) => l.id === destLedgerId);
    return dest !== undefined && Number(dest.balance) === TRANSFER_AMOUNT;
  });
  await waitFor('movement to appear in the feed', async () => {
    const movements = await apiGet<Array<{ from: string; to: string; amount: number }>>('/api/ledgers/movements');
    return movements.some(
      (m) => m.from === SOURCE_LEDGER.name && m.to === DEST_LEDGER.name && Number(m.amount) === TRANSFER_AMOUNT,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 — PAYROLL: create → approve → pay, verify status transitions + net pay
// ═══════════════════════════════════════════════════════════════════════════

test('create a payroll entry, approve it, and mark it paid', async ({ page }) => {
  test.setTimeout(120_000);
  await loginViaUI(page);
  // /hr$/i — the sidebar row reads "groups HR"; /hr/i alone would match "Christian".
  await openPanel(page, /hr$/i, /payroll & benefits/i);
  await expect(page.locator('h3', { hasText: 'Payroll & Benefits' })).toBeVisible({ timeout: 20_000 });

  // Open the inline create form.
  await page.getByRole('button', { name: /\+ New Payroll Entry/i }).click();
  const entryForm = page.locator('div', { hasText: 'NEW PAYROLL ENTRY' }).last();
  await expect(entryForm).toBeVisible();

  // Select our employee (option value = employee id).
  await entryForm.locator('select').first().selectOption(employeeId);
  await entryForm.locator('input[type="month"]').fill(PAYROLL.period);
  await entryForm.locator('input[type="number"]').nth(0).fill(String(PAYROLL.basicSalary));
  await entryForm.locator('input[type="number"]').nth(1).fill(String(PAYROLL.allowances));
  await entryForm.locator('input[type="number"]').nth(2).fill(String(PAYROLL.deductions));
  await entryForm.getByRole('button', { name: /save entry/i }).click();

  // The newest payroll row (top of the table) is ours. Wait until the list has
  // reloaded and the top row shows OUR employee as a Draft before acting.
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toContainText(employeeName, { timeout: 15_000 });
  await expect(firstRow).toContainText('Draft');
  await expect(firstRow.getByRole('button', { name: /^approve$/i })).toBeVisible();

  // Approve it.
  await firstRow.getByRole('button', { name: /^approve$/i }).click();
  await expect(firstRow).toContainText('Approved', { timeout: 15_000 });
  await expect(firstRow.getByRole('button', { name: /^pay$/i })).toBeVisible();

  // Mark it paid.
  await firstRow.getByRole('button', { name: /^pay$/i }).click();
  await expect(firstRow).toContainText('Paid', { timeout: 15_000 });

  // Final server-side verification: Draft → Approved → Paid, net pay computed.
  interface PayrollRow {
    employeeId: string;
    status: string;
    netPay: number;
    basicSalary: number;
  }
  const payrolls = await apiGet<PayrollRow[]>('/api/hr/payrolls');
  const ours = payrolls.find((p) => p.employeeId === employeeId && Number(p.netPay) === PAYROLL.netPay);
  expect(ours, 'payroll row with computed net pay should exist').toBeTruthy();
  expect(ours!.status).toBe('Paid');
  expect(Number(ours!.basicSalary)).toBe(PAYROLL.basicSalary);

  // Sanity: a leftover UI artifact would fail here — the feed must not contain
  // an unpaid draft for our exact net-pay figure.
  expect(payrolls.filter((p) => p.employeeId === employeeId && Number(p.netPay) === PAYROLL.netPay)).toHaveLength(1);
});
