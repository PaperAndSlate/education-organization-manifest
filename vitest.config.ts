import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      all: true,
      include: ['packages/*/dist/**/*.js'],
      exclude: ['**/*.test.js'],
      thresholds: {
        lines: 50,
        functions: 45,
        branches: 35,
        statements: 50,
      },
    },
  },
});
