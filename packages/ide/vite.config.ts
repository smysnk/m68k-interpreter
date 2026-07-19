import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { asmSourcePlugin } from './build/asmSourcePlugin';

const ideRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

function resolveBasePath(): string {
  if (process.env.VITE_BASE_PATH) {
    return normalizeBasePath(process.env.VITE_BASE_PATH);
  }

  if (process.env.VITE_DEPLOY_TARGET !== 'pages') {
    return '/';
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  return repositoryName ? normalizeBasePath(repositoryName) : '/';
}

export default defineConfig({
  base: resolveBasePath(),
  envDir: repositoryRoot,
  plugins: [asmSourcePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(ideRoot, 'src'),
    },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames(assetInfo) {
          const assetName = assetInfo.names?.[0] ?? assetInfo.name ?? '';
          return assetName.endsWith('.css') ? 'assets/app.css' : 'assets/[name]-[hash][extname]';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
