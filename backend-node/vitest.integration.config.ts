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
    // The same files as the unit tests' coverage (vitest.config.ts): here the routes, the
    // socket handlers and the services they reach are covered
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage/integration',
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/__tests__/**',
        'src/__integration__/**',
        'src/scripts/**',
        '**/*.d.ts',
      ],
      // At the measured level less about two points (2026-10-08), so coverage can't drop
      // unnoticed; raise them as it grows
      thresholds: { statements: 72, branches: 61, functions: 80, lines: 73 },
    },
  },
});
