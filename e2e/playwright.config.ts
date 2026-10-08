import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, BASE_URL, backendEnv } from './env';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // One database and one demo organization: the tests run one at a time
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The API serves the production web build (npm run e2e builds it) on its own origin, under the
  // headers production sends. Playwright starts it before the global setup runs, so it applies
  // the migrations itself.
  webServer: {
    command: 'npx prisma migrate deploy && npx tsx src/index.ts',
    cwd: '../backend-node',
    url: `http://localhost:${API_PORT}/api/health`,
    env: backendEnv(path.join(os.tmpdir(), 'robbie-e2e-uploads')),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
