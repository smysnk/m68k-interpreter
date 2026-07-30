import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    include: ['tests/benchmarks/**/*.test.ts'],
    exclude: ['references/**', '.test-results/**', '.tmp/**'],
  },
});
