import { defineConfig } from 'vitest/config';

// Integration tests talk to a real Postgres named by INTEGRATION_DATABASE_URL (never
// DATABASE_URL, which points at a developer database). Run: npm run test:integration
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__integration__/**/*.test.ts'],
    globalSetup: ['src/__integration__/globalSetup.ts'],
    setupFiles: ['src/__integration__/setup.ts'],
    // One database: run test files one at a time
    fileParallelism: false,
  },
});
