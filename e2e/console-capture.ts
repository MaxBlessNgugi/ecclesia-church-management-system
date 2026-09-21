/**
 * E2E instrumentation — console-error + network-failure capture.
 *
 * Wraps the default `page` fixture so every test records browser console
 * errors, uncaught page exceptions, failed requests, and HTTP >= 400
 * responses. Findings are attached to the test (visible in the HTML report)
 * and summarized on the console. Capture never fails a test — a green test
 * with console noise is reported, not hidden.
 */
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleErrors: string[] = [];
    const networkFailures: string[] = [];

    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
    page.on('requestfailed', (req) => {
      networkFailures.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) networkFailures.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
    });

    await use(page);

    for (const [name, entries] of [
      ['browser-console-errors', consoleErrors],
      ['network-failures', networkFailures],
    ] as const) {
      if (entries.length === 0) continue;
      await testInfo.attach(name, { body: entries.join('\n'), contentType: 'text/plain' });
      console.log(`  ⚠ ${testInfo.title}: ${entries.length} ${name.replace(/-/g, ' ')} — see attachment`);
    }
  },
});

export { expect };
