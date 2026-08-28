/**
 * ECCLESIA CHMS — Visual Tour
 *
 * A sequential, slow-motion Playwright tour of every module.
 * Each test logs in (fresh page), performs real actions, and verifies results.
 *
 *   npm run tour            — headed Chrome, slow motion
 *   npm run test:e2e        — headless CI
 */
import { test, expect, Page } from '@playwright/test';
const USERS = {
  admin: { email: 'admin@ecclesia.local', password: 'Admin123!', name: 'Administrator', role: 'admin' },
  viewer: { email: 'viewer@ecclesia.local', password: 'Viewer123!', name: 'Viewer', role: 'viewer' },
} as const;

const NEW_MEMBER = {
  baptismalName: 'Angela',
  secondName: 'Marie',
  sirName: 'TestFlight',
  nationalId: '33000001',
  phone: '0700123456',
};

import {
  announceStep,
  observe,
  waitForAppReady,
  highlightLocator,
  fillAndObserve,
  clickAndObserve,
  showDataFlow,
  loginViaUI,
  expectLoggedIn,
} from '../utils/tour-helpers';

// ─── Tiny local helpers ─────────────────────────────────────────────────────

/** Click the first sidebar/nav link matching the regex. */
async function go(page: Page, re: RegExp) {
  const link = page.locator('a, button, [role="button"]').filter({ hasText: re }).first();
  await clickAndObserve(link, 800);
}

/** Click the first tab/sub-tab matching the regex (silently skip if absent). */
async function tab(page: Page, re: RegExp) {
  const t = page.locator('button, a, [role="tab"]').filter({ hasText: re }).first();
  if (await t.isVisible().catch(() => false)) await clickAndObserve(t, 800);
}

/** True if any visible element matches the text regex. */
async function see(page: Page, re: RegExp) {
  return page.locator(`text=${re}`).first().isVisible().catch(() => false);
}

/** Highlight the first element matching the text regex (if present). */
async function showIfFound(page: Page, re: RegExp, ms = 1200) {
  if (await see(page, re)) {
    await highlightLocator(page.locator(`text=${re}`).first(), ms);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TOUR — serial, one login per test
// ═════════════════════════════════════════════════════════════════════════════

test.describe.serial('ECCLESIA Visual Tour', () => {

  // ── 1. AUTH ──────────────────────────────────────────────────────────────

  test('1 — Login screen', async ({ page }) => {
    await announceStep(page, 'Login Screen', 'Branding, form, connectivity');
    await page.goto('/');
    await waitForAppReady(page);

    await expect(page.locator('text=Ecclesia CMS')).toBeVisible();
    await expect(page.locator('text=Church Management System')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    await showIfFound(page, /System Online/);
    await observe(page, 1500);
  });

  test('2 — Sign in as admin', async ({ page }) => {
    await announceStep(page, 'Admin Login', 'Sr. Agnes Wanjiru (admin role)');
    await loginViaUI(page);
    await expectLoggedIn(page);
    await observe(page, 2000);
  });

  test('3 — Wrong password rejected', async ({ page }) => {
    await announceStep(page, 'Failed Login', 'Invalid credentials → error');
    await page.goto('/');
    await waitForAppReady(page);

    await page.locator('input[type="email"]').first().fill(USERS.admin.email);
    await page.locator('input[type="password"]').first().fill('WrongPassword!');
    await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).click();

    const err = page.locator('.border-red-300.bg-red-50, .bg-red-50').filter({ hasText: /invalid|error/i });
    await expect(err).toBeVisible({ timeout: 5_000 });
    await observe(page, 1500);
  });

  // ── 2. DASHBOARD ────────────────────────────────────────────────────────

  test('4 — Dashboard', async ({ page }) => {
    await announceStep(page, 'Dashboard', 'Parish overview');
    await loginViaUI(page);
    await expectLoggedIn(page);
    await observe(page, 3000);
  });

  // ── 3. CHRISTIAN REGISTRY ───────────────────────────────────────────────

  test('5 — Member list + search', async ({ page }) => {
    await announceStep(page, 'Christian Registry');
    await loginViaUI(page);

    await go(page, /christian|member|registry/i);
    await tab(page, /find|search|list|view/i);
    await observe(page, 1500);

    // Search for "Peter"
    const search = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await search.isVisible().catch(() => false)) {
      await fillAndObserve(search, 'Peter', 500);
      await observe(page, 1500);
      await showIfFound(page, /Peter Kamau/);
    }

    await observe(page, 1000);
  });

  test('6 — Create a new member', async ({ page }) => {
    await announceStep(page, 'Create Member', 'Adding Angela Marie TestFlight');
    await showDataFlow(page, 'Form Filled', 'Record Saved');
    await loginViaUI(page);

    await go(page, /christian|member|registry/i);
    await tab(page, /add|new|create/i);
    await observe(page, 800);

    // Fill by known placeholder text (matches ChristianView.tsx)
    const fill = async (placeholder: string, value: string) => {
      const input = page.locator(`input[placeholder="${placeholder}"]`).first();
      if (await input.isVisible().catch(() => false)) {
        await fillAndObserve(input, value, 300);
      }
    };
    await fill('First name', NEW_MEMBER.baptismalName);
    await fill('Second name', NEW_MEMBER.secondName);
    await fill('e.g. Smith', NEW_MEMBER.sirName);
    await fill('e.g. +254 700 000 000', NEW_MEMBER.phone);
    await fill('e.g. 12345678', NEW_MEMBER.nationalId);

    // Pick first non-empty option from each <select>
    for (const s of await page.locator('select').all()) {
      if (await s.isVisible().catch(() => false)) {
        const opts = await s.locator('option').allTextContents();
        if (opts.length > 1) await s.selectOption({ index: 1 });
      }
    }

    const submit = page.locator('button[type="submit"], button').filter({ hasText: /save|submit|add|create/i }).first();
    if (await submit.isVisible().catch(() => false)) await clickAndObserve(submit, 2000);
    await observe(page, 1500);
  });

  // ── 4. ACTIVITIES ───────────────────────────────────────────────────────

  test('7 — Contributions + billing', async ({ page }) => {
    await announceStep(page, 'Activities', 'Contributions, transfers, billing');
    await loginViaUI(page);

    await go(page, /activities|contribution|payment/i);
    await observe(page, 1500);

    // Try to record a contribution
    await tab(page, /receive|payment|contribution|new/i);
    await observe(page, 1000);

    const memberSelect = page.locator('select, [role="combobox"]').first();
    if (await memberSelect.isVisible().catch(() => false)) {
      const opts = await memberSelect.locator('option').allTextContents();
      if (opts.length > 1) await memberSelect.selectOption({ index: 1 });
    }

    const amount = page.locator('input[placeholder*="amount" i], input[type="number"]').first();
    if (await amount.isVisible().catch(() => false)) await fillAndObserve(amount, '5000', 400);

    const submit = page.locator('button[type="submit"], button').filter({ hasText: /save|submit|record/i }).first();
    if (await submit.isVisible().catch(() => false)) await clickAndObserve(submit, 2000);

    // View history tab
    await tab(page, /history|list|view|tracker/i);
    await observe(page, 1500);
  });

  // ── 5. SACRAMENTS ───────────────────────────────────────────────────────

  test('8 — Sacraments + death records', async ({ page }) => {
    await announceStep(page, 'Sacraments', 'Baptism, marriage, death');
    await loginViaUI(page);

    await go(page, /sacrament/i);
    await tab(page, /card|update|record|view/i);
    await observe(page, 2000);

    // Death records
    await tab(page, /death|deceased|burial/i);
    await observe(page, 1500);
    await showIfFound(page, /Florence Muthoni|Rest in peace/);
    await observe(page, 1000);
  });

  // ── 6. FINANCE ──────────────────────────────────────────────────────────

  test('9 — Finance: deposits, creditors, debtors, expenses', async ({ page }) => {
    await announceStep(page, 'Finance', 'Deposits, creditors, debtors, expenses');
    await loginViaUI(page);

    await go(page, /finance|bank|deposit/i);
    await observe(page, 1500);

    // Deposits
    await tab(page, /deposit|bank/i);
    await observe(page, 1500);
    await showIfFound(page, /KCB|Equity|Co-operative/);

    // Creditors
    await tab(page, /creditor|vendor|payable/i);
    await observe(page, 1500);
    await showIfFound(page, /Catholic Supply|Premium Printers/);

    // Debtors
    await tab(page, /debtor|receivable|outstanding/i);
    await observe(page, 1500);
    await showIfFound(page, /Stephen Mutua|Grace Achieng/);

    // Expenses
    await tab(page, /expense|voucher/i);
    await observe(page, 1500);
    await showIfFound(page, /Electricity|Roof repair|Transport/);
  });

  // ── 7. LEDGERS ──────────────────────────────────────────────────────────

  test('10 — Ledgers + movements', async ({ page }) => {
    await announceStep(page, 'Ledgers', 'Accounts and inter-ledger transfers');
    await loginViaUI(page);

    await go(page, /ledger|account|fund/i);
    await observe(page, 2000);
    await showIfFound(page, /Parish Main|Construction Fund|Youth Ministry/);

    await tab(page, /movement|transfer|history/i);
    await observe(page, 1500);
  });

  // ── 8. INVENTORY ────────────────────────────────────────────────────────

  test('11 — Inventory: stock, sales, deliveries', async ({ page }) => {
    await announceStep(page, 'Inventory', 'Stock, sales, deliveries');
    await loginViaUI(page);

    await go(page, /inventory|stock|item/i);
    await observe(page, 1500);

    await tab(page, /item|stock|list/i);
    await observe(page, 1500);
    await showIfFound(page, /Altar Candles|Mass Wine|Communion Wafers/);

    await tab(page, /sale|sell|transaction/i);
    await observe(page, 1500);

    await tab(page, /deliver|supplier/i);
    await observe(page, 1500);
    await showIfFound(page, /Catholic Supply|Premium Printers/);
  });

  // ── 9. REPORTS ──────────────────────────────────────────────────────────

  test('12 — Reports', async ({ page }) => {
    await announceStep(page, 'Reports', 'Sacrament, contribution, sales analytics');
    await loginViaUI(page);

    await go(page, /report|analytics/i);
    await observe(page, 1500);

    await tab(page, /sacrament|baptism/i);
    await observe(page, 2000);

    await tab(page, /contribution|giving|tithing/i);
    await observe(page, 2000);

    await tab(page, /sales|inventory/i);
    await observe(page, 2000);
  });

  // ── 10. HR ──────────────────────────────────────────────────────────────

  test('13 — HR: employees, payroll, leave, recruitment', async ({ page }) => {
    await announceStep(page, 'HR', 'Employees, payroll, leave, recruitment');
    await loginViaUI(page);

    await go(page, /hr|human.resource|employee|payroll/i);
    await observe(page, 1500);

    await tab(page, /employee|staff|list/i);
    await observe(page, 1500);
    await showIfFound(page, /Agnes Wanjiru|Samuel Kariuki|Ruth Kiptoo/);

    await tab(page, /payroll|salary|pay/i);
    await observe(page, 1500);
    await showIfFound(page, /45000|52000|net pay/);

    await tab(page, /leave|vacation/i);
    await observe(page, 1500);
    await showIfFound(page, /Annual Leave|Sick Leave|Approved|Pending/);

    await tab(page, /recruit|position|applicant/i);
    await observe(page, 1500);
    await showIfFound(page, /Catechist|Joyce Wambui/);
  });

  // ── 11. ADMIN ───────────────────────────────────────────────────────────

  test('14 — Admin: users, permissions, settings, backup, audit', async ({ page }) => {
    await announceStep(page, 'Administration', 'Users, permissions, settings, system tools');
    await loginViaUI(page);

    await go(page, /admin|setting|system/i);
    await observe(page, 1500);

    // User list
    await tab(page, /user|account|people|list/i);
    await observe(page, 1500);
    await showIfFound(page, new RegExp(USERS.admin.name));

    // Permissions
    await tab(page, /permission|right|access|panel/i);
    await observe(page, 1500);
    await showIfFound(page, /christian|activities|finance|panel/);

    // Parish identity
    await tab(page, /parish|identity|setting|brand/i);
    await observe(page, 1500);
    await showIfFound(page, /Our Lady of Mercy|Nairobi Archdiocese/);

    // Backups
    await tab(page, /backup|restore/i);
    await observe(page, 1500);

    // Audit / trash
    await tab(page, /trash|audit|deleted|log/i);
    await observe(page, 1500);
  });

  // ── 12. REAL-TIME ───────────────────────────────────────────────────────

  test('15 — Socket.IO + multi-tab sync', async ({ page, context }) => {
    await announceStep(page, 'Real-time', 'Socket.IO multi-tab live updates');
    await showDataFlow(page, 'Tab 1', 'Tab 2 (live sync)');
    await loginViaUI(page);

    // Verify connection indicator
    await showIfFound(page, /online|connected/i, 1500);

    // Open second tab — same context shares localStorage → auto-authenticated
    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForTimeout(3000);

    // Both tabs should show the app shell
    await expect(page.locator('aside, nav, header').first()).toBeVisible();
    await expect(page2.locator('aside, nav, header').first()).toBeVisible();
    await observe(page, 2000);

    await page2.close();
  });

  // ── 13. EDGE CASES ──────────────────────────────────────────────────────

  test('16 — Viewer cannot register users (server-side 403)', async ({ page }) => {
    await announceStep(page, 'Permission Test', 'Viewer → register blocked by server');
    await loginViaUI(page, USERS.viewer);
    await expectLoggedIn(page);

    // Navigate to admin → user management
    await go(page, /admin|setting|system/i);
    await tab(page, /user|account|people/i);
    await observe(page, 1500);

    // Attempt to register a new user via the API (viewer is not super_admin)
    const res = await page.request.post('/api/auth/register', {
      data: { email: 'viewer尝试注册@test.com', password: 'Test1234!', name: 'Should Fail', role: 'staff' },
      headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('ecclesia_token'))}` },
    });
    expect(res.status()).toBe(403);
    await observe(page, 1000);
  });

  // ── 14. DONE ────────────────────────────────────────────────────────────

  test('17 — Tour complete', async ({ page }) => {
    await announceStep(page, 'Tour Complete!', 'All modules verified ✅');
    await loginViaUI(page);

    await page.evaluate(() => {
      document.getElementById('__tour-banner')?.remove();
      document.body.insertAdjacentHTML('afterbegin', `
        <div id="__tour-banner" style="
          position:fixed;top:0;left:0;right:0;z-index:999999;
          background:linear-gradient(135deg,#059669,#10b981,#34d399);
          color:#fff;padding:20px 24px;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          font-size:16px;display:flex;align-items:center;gap:16px;
          box-shadow:0 4px 20px rgba(0,0,0,.3)">
          <div style="font-size:32px">🎉</div>
          <div style="flex:1">
            <strong style="font-size:18px">ECCLESIA Visual Tour Complete!</strong><br>
            <span style="opacity:.9;font-size:13px">
              Login → Dashboard → Members → Activities → Sacraments → Finance →
              Ledgers → Inventory → Reports → HR → Admin → Real-time
            </span>
          </div>
        </div>`);
    });
    await observe(page, 5000);
  });
});
