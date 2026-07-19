import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { asmSourcePlugin } from './build/asmSourcePlugin';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [asmSourcePlugin(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    css: true,
    include: ['src/**/*.test.ts?(x)'],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
