/**
 * ECCLESIA CHMS — Forgot-password round trip (audit P1.3)
 *
 * Drives the REAL user flow on the login screen:
 *
 *   Forgot Password? → email → "a reset code has been sent"
 *   → read the one-time code from the dev mail outbox (the backend writes
 *     backend/logs/outbox when no SMTP is configured)
 *   → redeem code + new password → sign in with the new password
 *   → assert the code cannot be replayed and the old password is rejected
 *
 * The account's ORIGINAL password is restored at the end so later specs (the
 * visual tour's viewer checks) still pass against the same database.
 *
 * Prerequisites:
 *   - Mail delivery must be in dev-outbox mode: no MailSettings row enabled
 *     and no SMTP_HOST env var, so reset codes land on disk. The CI e2e job
 *     and a local `node backend/dist/index.js` run both satisfy this.
 *   - Outbox location: <repo>/logs/outbox when the backend is started from
 *     the repo root (how Playwright's webServer starts it), or
 *     backend/logs/outbox when started from backend/. Override the search
 *     root with E2E_OUTBOX_DIR for remote/external servers.
 *
 *   npm run test:e2e   — full headless run (CI)
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';

// Account comes from backend/scripts/seed-e2e.ts (viewer@ecclesia.local /
// Viewer123!); override with E2E_VIEWER_EMAIL / E2E_VIEWER_PASSWORD.
const VIEWER = {
  email: process.env.E2E_VIEWER_EMAIL || 'viewer@ecclesia.local',
  password: process.env.E2E_VIEWER_PASSWORD || 'Viewer123!',
} as const;

// Replacement password — satisfies the policy (upper, lower, digit, special).
const NEW_PASSWORD = 'ResetE2E123!';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUTBOX_DIRS: string[] = [
  process.env.E2E_OUTBOX_DIR,
  path.join(ROOT, 'logs', 'outbox'),
  path.join(ROOT, 'backend', 'logs', 'outbox'),
].filter((d): d is string => !!d);

// ─── Outbox helpers ─────────────────────────────────────────────────────────

interface OutboxEntry {
  file: string;
  code: string;
  mtimeMs: number;
}

/** Scan the dev mail outbox for reset-code files addressed to `email`. */
function scanOutbox(email: string): OutboxEntry[] {
  const found: OutboxEntry[] = [];
  for (const dir of OUTBOX_DIRS) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue; // dir not created yet
    }
    for (const file of files) {
      if (!file.endsWith('.txt')) continue;
      const full = path.join(dir, file);
      let content: string;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (!content.includes(`To:      ${email}`)) continue;
      const match = content.match(/^    ([A-Za-z0-9]{8})$/m);
      if (!match) continue;
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        /* keep 0 — newer files sort later anyway */
      }
      found.push({ file: full, code: match[1], mtimeMs });
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found;
}

/** Latest outbox write time for `email` (used as the "before" marker). */
function latestOutboxMtime(email: string): number {
  const entries = scanOutbox(email);
  return entries.length > 0 ? entries[0].mtimeMs : 0;
}

/** Poll until a reset-code file for `email` appears that is newer than `after`. */
async function waitForNewCode(email: string, after: number, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entry = scanOutbox(email).find((e) => e.mtimeMs > after);
    if (entry) return entry.code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `No password-reset code appeared in the mail outbox for ${email}. ` +
      'Is the backend in dev-outbox mode (no SMTP_HOST, MailSettings disabled)? ' +
      `Searched: ${OUTBOX_DIRS.join(', ')}`,
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

/** Sign in via the login UI with explicit credentials. */
async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#root > *', { timeout: 30_000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in|login/i }).click();
  await page.waitForFunction(() => !!localStorage.getItem('ecclesia_token'), { timeout: 10_000 });
  await page.waitForSelector('main', { timeout: 15_000 });
}

// ═══════════════════════════════════════════════════════════════════════════
// FORGOT-PASSWORD ROUND TRIP (serial — the whole lifecycle in one test)
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Password reset round trip', () => {
  test('request → read code → reset → sign in with new password (and restore)', async ({ page, request }) => {
    test.setTimeout(180_000);

    // ── 1. Request the reset code from the login screen ───────────────────
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 30_000 });
    await page.getByRole('button', { name: /forgot password\?/i }).click();
    await expect(page.getByRole('button', { name: /request reset code/i })).toBeVisible();

    const before = latestOutboxMtime(VIEWER.email);
    await page.locator('input[type="email"]').fill(VIEWER.email);
    await page.getByRole('button', { name: /request reset code/i }).click();

    // Anti-enumeration: always shows the "code sent" confirmation.
    await expect(page.locator('text=one-time reset code has been sent')).toBeVisible({ timeout: 15_000 });

    // ── 2. Read the code out of the dev mail outbox ───────────────────────
    const code = await waitForNewCode(VIEWER.email, before);
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/);

    // ── 3. Redeem the code + set a new password ───────────────────────────
    await page.getByRole('button', { name: /i have a reset code/i }).click();
    const form = page.locator('form').filter({ hasText: /reset password/i });
    await expect(form.getByRole('button', { name: /^reset password$/i })).toBeVisible();

    await form.locator('input[type="text"]').fill(code); // Reset Code
    await form.locator('input[type="password"]').nth(0).fill(NEW_PASSWORD); // New Password
    await form.locator('input[type="password"]').nth(1).fill(NEW_PASSWORD); // Confirm
    await form.getByRole('button', { name: /^reset password$/i }).click();

    await expect(page.locator('text=has been reset successfully')).toBeVisible({ timeout: 15_000 });

    // ── 4. The old password is now rejected ───────────────────────────────
    const oldLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: VIEWER.email, password: VIEWER.password },
    });
    expect(oldLogin.status()).toBe(401);

    // ── 5. The code is single-use — replaying it must fail ────────────────
    const replay = await request.post(`${BASE_URL}/api/auth/reset-password`, {
      data: { token: code, newPassword: 'ShouldNotApply123!' },
    });
    expect(replay.status()).toBe(400);

    // ── 6. Sign in with the new password through the UI ────────────────────
    await page.getByRole('button', { name: /back to sign in/i }).first().click();
    await loginViaUI(page, VIEWER.email, NEW_PASSWORD);
    await expect(page.locator('main').first()).toBeVisible();

    // ── 7. Restore the account's original password (leave the DB clean) ───
    const marker = latestOutboxMtime(VIEWER.email);
    const forgotAgain = await request.post(`${BASE_URL}/api/auth/forgot-password`, {
      data: { email: VIEWER.email },
    });
    expect(forgotAgain.status()).toBe(200);
    const restoreCode = await waitForNewCode(VIEWER.email, marker);
    expect(restoreCode).not.toBe(code);

    const restore = await request.post(`${BASE_URL}/api/auth/reset-password`, {
      data: { token: restoreCode, newPassword: VIEWER.password },
    });
    expect(restore.status()).toBe(200);

    // Sanity: original credentials work again for the specs that follow.
    const sanity = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: VIEWER.email, password: VIEWER.password },
    });
    expect(sanity.status()).toBe(200);
  });
});
