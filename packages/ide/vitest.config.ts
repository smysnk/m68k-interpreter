import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    {
      name: 'asm-raw-loader',
      enforce: 'pre',
      load(id) {
        if (!id.endsWith('.asm')) {
          return null;
        }

        return `export default ${JSON.stringify(fs.readFileSync(id, 'latin1'))};`;
      },
    },
    react(),
  ],
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
