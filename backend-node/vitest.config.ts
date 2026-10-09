import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      // Every source file, also those no unit test imports (they count as 0%): the routes and
      // the services the integration tests cover show here as the gap they are in unit tests
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/__tests__/**',
        'src/__integration__/**',
        // Command-line entry points; their logic lives in the modules they call
        'src/scripts/**',
        '**/*.d.ts',
      ],
      // At the measured level less about two points (2026-10-08), so coverage can't drop
      // unnoticed; raise them as it grows
      thresholds: { statements: 33, branches: 40, functions: 33, lines: 33 },
    },
  },
});
