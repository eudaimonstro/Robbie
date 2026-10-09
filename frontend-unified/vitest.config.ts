import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Run in a non-UTC zone so date-shift bugs show up (CI runs in UTC)
    env: { TZ: 'America/Chicago' },
    // Process the stylesheet so `index.css?raw` returns its text (the tokens test reads it);
    // every other CSS import stays an empty module
    css: { include: [/styles\/index\.css/] },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      // Every source file, also those no test imports (they count as 0%)
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // Barrels and the entry point: nothing to test
        '**/index.ts',
        'src/main.tsx',
      ],
      // At the measured level less about two points (2026-10-08), so coverage can't drop
      // unnoticed; raise them as it grows
      thresholds: { statements: 76, branches: 73, functions: 71, lines: 77 },
    },
  },
});
