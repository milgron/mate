import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__mocks__/**'],
      thresholds: {
        functions: 80,
        branches: 70,
        lines: 80,
      },
    },
    setupFiles: ['./tests/setup.ts'],
  },
});
