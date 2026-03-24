import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';

export default defineConfig({
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
    include: ['tests/integration/**/*.test.ts?(x)'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './packages/ide/src'),
    },
  },
});
