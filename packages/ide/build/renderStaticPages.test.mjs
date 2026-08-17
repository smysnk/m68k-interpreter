import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  injectLandingContent,
  renderHelpPage,
  renderRedirectPage,
} from './renderStaticPages.mjs';

const helpContent = JSON.parse(await readFile(
  new URL('../src/content/helpContent.json', import.meta.url),
  'utf8',
));

test('injectLandingContent adds crawlable interpreter copy only for the interpreter route', () => {
  const source = '<html><body><div id="root"></div></body></html>';
  const interpreter = injectLandingContent(source, '/m68k-interpreter');
  const nibbles = injectLandingContent(source, '/nibbles');
  const root = injectLandingContent(source, '/');

  assert.match(interpreter, /<h1[^>]*>M68K Interpreter — Run Motorola 68000 Assembly/);
  assert.match(interpreter, /href="\/m68k-interpreter\/help"/);
  assert.match(nibbles, /<h1[^>]*>Play Nibbles 68000/);
  assert.equal(root, source);
});

test('renderHelpPage uses the shared help content and a clean canonical', () => {
  const html = renderHelpPage({
    helpContent,
    basePathValue: '/m68k-interpreter',
    canonicalOrigin: 'https://smysnk.com',
  });

  assert.match(html, /rel="canonical" href="https:\/\/smysnk.com\/m68k-interpreter\/help"/);
  assert.match(html, /all 116 tracked MC68000 forms/);
  assert.match(html, /Open the browser-based M68K interpreter/);
  assert.match(html, /"@type":"TechArticle"/);
});

test('renderRedirectPage consolidates old hosts without an indexable duplicate', () => {
  const html = renderRedirectPage({ targetUrl: 'https://smysnk.com/m68k-interpreter' });
  assert.match(html, /noindex,follow/);
  assert.match(html, /rel="canonical" href="https:\/\/smysnk.com\/m68k-interpreter"/);
  assert.match(html, /window.location.replace/);
});
