import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for ECCLESIA ChMS visual tour + E2E tests.
 *
 * Run modes:
 *   npx playwright test                  — headless (CI)
 *   npx playwright test --headed        — watch in your browser
 *   npx playwright test --project=tour   — slow-motion visual tour
 *   npx playwright show-report           — open HTML report after run
 *
 * Server startup:
 *   Playwright starts the COMPILED BACKEND (backend/dist/index.js), which
 *   self-hosts the built frontend from <repo>/dist and the API on the same
 *   origin (production mode). Run `npm run build` first. When E2E_BASE_URL is
 *   set, an external server is assumed and none is started.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Sequential for the visual tour
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node backend/dist/index.js',
        cwd: '..',
        url: 'http://127.0.0.1:5000/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  use: {
    // Same-origin default: the compiled backend serves dist/ + /api on 5000.
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5000',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'tour',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          slowMo: 400,
        },
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'fast',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  outputDir: '../test-results',
});
