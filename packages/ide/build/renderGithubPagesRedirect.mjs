import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRedirectPage } from './renderStaticPages.mjs';

const ideDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirectory = path.join(ideDirectory, 'out');

await rm(outDirectory, { recursive: true, force: true });
await mkdir(path.join(outDirectory, 'help'), { recursive: true });
await writeFile(path.join(outDirectory, '.nojekyll'), '', 'utf8');
await writeFile(path.join(outDirectory, 'index.html'), renderRedirectPage({
  targetUrl: 'https://smysnk.com/m68k-interpreter',
}), 'utf8');
await writeFile(path.join(outDirectory, 'help/index.html'), renderRedirectPage({
  targetUrl: 'https://smysnk.com/m68k-interpreter/help',
}), 'utf8');
await writeFile(path.join(outDirectory, '404.html'), renderRedirectPage({
  targetUrl: 'https://smysnk.com/m68k-interpreter',
}), 'utf8');
