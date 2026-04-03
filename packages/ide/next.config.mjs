import '../../scripts/load-root-env.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const isGithubPagesExport = process.env.NEXT_OUTPUT_MODE === 'export';
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const githubPagesBasePath =
  isGithubPagesExport && repositoryName ? `/${repositoryName}` : '';

const nextConfig = {
  compiler: {
    styledComponents: true,
  },
  ...(isGithubPagesExport
    ? {
        output: 'export',
        images: {
          unoptimized: true,
        },
        trailingSlash: true,
        basePath: githubPagesBasePath,
        assetPrefix: githubPagesBasePath,
      }
    : {}),
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@m68k/interpreter'],
  webpack(config) {
    config.module.rules.push({
      test: /\.asm$/i,
      use: [
        {
          loader: path.resolve(import.meta.dirname, './loaders/asm-latin1-loader.cjs'),
        },
      ],
    });

    return config;
  },
};

export default nextConfig;
