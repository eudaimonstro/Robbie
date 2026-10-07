import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, WEB_PORT, backendEnv } from './env';

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
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Playwright starts these before the global setup runs, so the API applies the migrations itself
  webServer: [
    {
      command: 'npx prisma migrate deploy && npx tsx src/index.ts',
      cwd: '../backend-node',
      url: `http://localhost:${API_PORT}/api/health`,
      env: backendEnv(path.join(os.tmpdir(), 'robbie-e2e-uploads')),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The production build (npm run e2e builds it), proxying /api and /socket.io to the API
      command: `npx vite preview --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend-unified',
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
