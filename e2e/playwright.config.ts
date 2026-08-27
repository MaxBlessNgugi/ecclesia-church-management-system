import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for ECCLESIA ChMS visual tour + E2E tests.
 *
 * Run modes:
 *   npx playwright test                  — headless (CI)
 *   npx playwright test --headed        — watch in your browser
 *   npx playwright test --project=tour   — slow-motion visual tour
 *   npx playwright show-report           — open HTML report after run
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
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
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
