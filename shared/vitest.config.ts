import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      // Every source file, also those no test imports (they count as 0%)
      include: ['constants/**/*.ts', 'reducer/**/*.ts', 'types/**/*.ts', 'utils/**/*.ts'],
      exclude: ['**/*.d.ts'],
      // At the measured level less about two points (2026-10-08), so coverage can't drop
      // unnoticed; raise them as it grows
      thresholds: { statements: 80, branches: 71, functions: 83, lines: 82 },
    },
  },
});
