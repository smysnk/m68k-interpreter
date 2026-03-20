import '../../scripts/load-root-env.mjs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function readPortEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: process.env.WEB_HOST || '127.0.0.1',
    port: readPortEnv(process.env.WEB_PORT, 3000),
    strictPort: true,
    open: readBooleanEnv(process.env.WEB_OPEN, true),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
