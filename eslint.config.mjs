import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/*.config.*',
      'backend-node/src/generated/**',
      // Agents' git worktrees (other branches' code, linted on their own branch)
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['shared/**/*.ts', 'backend-node/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['frontend-unified/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // A context's file exports its provider and the hook that reads it, which fast refresh
    // can't hot-swap; a full reload of the page is fine for these few files
    files: ['frontend-unified/src/context/**', 'frontend-unified/src/modules/*/context/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Node scripts and the Playwright harness
    files: ['scripts/**/*.mjs', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
