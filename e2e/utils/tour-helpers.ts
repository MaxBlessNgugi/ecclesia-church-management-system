import { Page, Locator, expect } from '@playwright/test';
const USERS = {
  admin: { email: 'admin@ecclesia.local', password: 'Admin123!', name: 'Administrator', role: 'admin' },
} as const;

// ─── On-Screen Annotations ──────────────────────────────────────────────────

/** Show a floating banner naming the current step. */
export async function announceStep(page: Page, title: string, detail?: string) {
  await page.evaluate(() => document.getElementById('__tour-banner')?.remove());
  await page.evaluate(
    ({ t, d }) => {
      document.body.insertAdjacentHTML('afterbegin', `
        <div id="__tour-banner" style="
          position:fixed;top:0;left:0;right:0;z-index:999999;
          background:linear-gradient(135deg,#1a1c1c,#333);
          color:#fff;padding:14px 24px;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          font-size:14px;display:flex;align-items:center;gap:16px;
          box-shadow:0 4px 20px rgba(0,0,0,.3)">
          <div style="background:#4ade80;color:#000;font-weight:700;padding:4px 12px;border-radius:20px;font-size:12px;white-space:nowrap">
            ECCLESIA
          </div>
          <div style="flex:1">
            <strong style="font-size:15px">${t}</strong>
            ${d ? `<span style="opacity:.7;margin-left:12px">${d}</span>` : ''}
          </div>
        </div>`);
    },
    { t: title, d: detail },
  );
  await page.waitForTimeout(800);
}

/** Show a blue/purple banner connecting two modules (data-flow demo). */
export async function showDataFlow(page: Page, from: string, to: string) {
  await page.evaluate(() => document.getElementById('__tour-banner')?.remove());
  await page.evaluate(
    ({ f, t }) => {
      document.body.insertAdjacentHTML('afterbegin', `
        <div id="__tour-banner" style="
          position:fixed;top:0;left:0;right:0;z-index:999999;
          background:linear-gradient(135deg,#1e40af,#7c3aed);
          color:#fff;padding:14px 24px;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          font-size:14px;display:flex;align-items:center;gap:16px;
          box-shadow:0 4px 20px rgba(0,0,0,.3)">
          <div style="background:#fbbf24;color:#000;font-weight:700;padding:4px 12px;border-radius:20px;font-size:12px;white-space:nowrap">DATA FLOW</div>
          <div style="flex:1"><strong>${f}</strong><span style="margin:0 8px">→</span><strong>${t}</strong></div>
        </div>`);
    },
    { f: from, t: to },
  );
  await page.waitForTimeout(1200);
}

// ─── Element Highlights ─────────────────────────────────────────────────────

/** Add a red outline around a locator, hold, then remove it. */
export async function highlightLocator(locator: Locator, durationMs = 2000) {
  const apply = (el: HTMLElement) => {
    el.style.outline = '3px solid #ef4444';
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 0 6px rgba(239,68,68,.2)';
  };
  const clear = (el: HTMLElement) => {
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.boxShadow = '';
  };
  await locator.evaluate(apply);
  await locator.page().waitForTimeout(durationMs);
  await locator.evaluate(clear);
}

// ─── Pauses ─────────────────────────────────────────────────────────────────

/** Pause so the viewer can see the result. */
export async function observe(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

/** Click, then pause. */
export async function clickAndObserve(locator: Locator, ms = 1500) {
  await locator.click();
  await locator.page().waitForTimeout(ms);
}

/** Highlight then fill, for visual feedback on form inputs. */
export async function fillAndObserve(locator: Locator, value: string, ms = 800) {
  await highlightLocator(locator, 500);
  await locator.fill(value);
  await locator.page().waitForTimeout(ms);
}

// ─── App Readiness ──────────────────────────────────────────────────────────

/** Wait for React root to render. */
export async function waitForAppReady(page: Page) {
  await page.waitForSelector('#root > *', { timeout: 30_000 });
  await page.waitForTimeout(1000);
}

// ─── Auth Helpers ───────────────────────────────────────────────────────────

/** Log in via the UI and wait for the main app to appear. */
export async function loginViaUI(page: Page, user: { email: string; password: string; name: string; role: string } = USERS.admin) {
  await page.goto('/');
  await waitForAppReady(page);

  const hasToken = await page.evaluate(() => !!localStorage.getItem('ecclesia_token'));
  if (hasToken) {
    const onLogin = await page.locator('input[type="email"]').isVisible().catch(() => false);
    if (!onLogin) return;
  }

  await page.locator('input[type="email"]').first().fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in|login/i }).click();

  await page.waitForFunction(() => !!localStorage.getItem('ecclesia_token'), { timeout: 10_000 });
  await waitForAppReady(page);
  await observe(page, 500);
}

/** Assert the main app shell is visible (sidebar/header present). */
export async function expectLoggedIn(page: Page) {
  await expect(page.locator('aside, nav, header').first()).toBeVisible({ timeout: 10_000 });
}
