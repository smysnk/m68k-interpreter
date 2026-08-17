import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const buildDirectory = path.dirname(fileURLToPath(import.meta.url));
const ideDirectory = path.resolve(buildDirectory, '..');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const normalizeBasePath = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
};

const interpreterLanding = (basePath) => `
    <!-- crawlable-product-content:start -->
    <section class="seo-content" id="about-this-build" aria-labelledby="m68k-interpreter-title">
      <div class="seo-content__inner">
        <p class="seo-content__eyebrow">Zero-setup assembly development environment</p>
        <h1 id="m68k-interpreter-title">M68K Interpreter — Run Motorola 68000 Assembly in Your Browser</h1>
        <p class="seo-content__lead">Write, run, step through, and debug Motorola 68000 and 68010 assembly without installing a desktop toolchain. The browser IDE keeps code, registers, memory, terminal output, and emulated hardware visible while the program executes.</p>
        <div class="seo-content__grid">
          <section>
            <h2>Inspect every execution step</h2>
            <p>Use the worker-backed interpreter to run continuously or advance one instruction at a time. Register, flag, memory, stack, terminal, and undo history views make state changes explicit instead of hiding them behind a single output window.</p>
          </section>
          <section>
            <h2>Experiment with Easy68K-style hardware</h2>
            <p>Load examples for seven-segment displays, switches, LEDs, active-low buttons, and level 1–7 interrupt requests. The Easy68K machine profile adds the terminal, trap, and trainer-board services used by browser-playable programs such as Nibbles.</p>
          </section>
          <section>
            <h2>Start from working M68K examples</h2>
            <p>Bundled programs cover terminal output and input, arithmetic, comparisons and flags, memory copying, subroutines and stack behavior, hardware devices, interrupts, and the original Nibbles game.</p>
          </section>
          <section>
            <h2>Know the compatibility boundary</h2>
            <p>The strict core tracks the complete project-defined MC68000 instruction contract plus MC68010 extensions. Easy68K terminal and device behavior is a documented compatibility subset rather than a claim of pin-level hardware timing.</p>
          </section>
        </div>
        <nav class="seo-content__links" aria-label="M68K interpreter resources">
          <a href="${basePath}/help">Read the M68K instruction and compatibility guide</a>
          <a href="https://smysnk.com/nibbles">Play Nibbles 68000</a>
          <a href="https://smysnk.com/blog/projects-section-is-now-live">Read the project history</a>
          <a href="https://github.com/smysnk/m68k-interpreter">View the source on GitHub</a>
          <a href="https://github.com/gianlucarea/m68k-interpreter">Visit the original upstream project</a>
        </nav>
      </div>
    </section>
    <!-- crawlable-product-content:end -->`;

const nibblesLanding = () => `
    <!-- crawlable-product-content:start -->
    <section class="seo-content" id="about-this-build" aria-labelledby="nibbles-title">
      <div class="seo-content__inner">
        <p class="seo-content__eyebrow">A college assembly game, running again</p>
        <h1 id="nibbles-title">Play Nibbles 68000 in Your Browser</h1>
        <p class="seo-content__lead">This is the original Motorola 68000 Nibbles game written for a college assembly course in 2007, restored through the browser-based M68K interpreter. Use W A S D, the arrow keys, or keypad 4 5 6 8, then press Enter to confirm menus.</p>
        <nav class="seo-content__links" aria-label="Nibbles 68000 resources">
          <a href="https://smysnk.com/m68k-interpreter">Open the M68K assembly interpreter</a>
          <a href="https://github.com/smysnk/nibbles68k">View the Nibbles source</a>
        </nav>
      </div>
    </section>
    <!-- crawlable-product-content:end -->`;

export const injectLandingContent = (html, basePathValue) => {
  const basePath = normalizeBasePath(basePathValue);
  const landing = basePath === '/m68k-interpreter'
    ? interpreterLanding(basePath)
    : basePath === '/nibbles'
      ? nibblesLanding()
      : '';
  if (!landing) return html;
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('Built IDE HTML is missing the #root mount point.');
  }
  return html.replace('<div id="root"></div>', `<div id="root"></div>${landing}`);
};

const renderSection = (section) => {
  const paragraphs = (section.paragraphs || [])
    .map((paragraph) => `        <p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
  const items = section.items?.length
    ? `        <ul>\n${section.items.map((item) => `          <li>${escapeHtml(item)}</li>`).join('\n')}\n        </ul>`
    : '';
  return `      <section id="${escapeHtml(section.id)}">
        <h2>${escapeHtml(section.title)}</h2>
${paragraphs}
${items}
      </section>`;
};

export const renderHelpPage = ({
  helpContent,
  basePathValue,
  canonicalOrigin,
  cssAssetPath = '../assets/app.css',
}) => {
  const basePath = normalizeBasePath(basePathValue);
  const canonicalUrl = `${String(canonicalOrigin).replace(/\/+$/, '')}${basePath}/help`;
  const description = helpContent.subtitle;
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'M68K Interpreter Help: Motorola 68000 Instructions and Easy68K Compatibility',
    description,
    url: canonicalUrl,
    author: {
      '@type': 'Person',
      name: 'smysnk',
      url: 'https://smysnk.com',
    },
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="M68K Interpreter Help: Motorola 68000 Instructions and Easy68K Compatibility" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <title>M68K Interpreter Help: Motorola 68000 Instructions and Easy68K Compatibility</title>
    <link rel="stylesheet" href="${escapeHtml(cssAssetPath)}" />
    <style>
      :root { color-scheme: dark; --help-bg: #0b1018; --help-surface: #141c28; --help-border: #2a394d; --help-text: #e8edf5; --help-muted: #aab7ca; --help-accent: #7cc7ff; }
      * { box-sizing: border-box; }
      html { background: var(--help-bg); color: var(--help-text); font-family: system-ui, sans-serif; }
      body { margin: 0; background: radial-gradient(circle at top, #17243a 0, var(--help-bg) 38rem); color: var(--help-text); }
      main { width: min(880px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0 80px; }
      header { margin-bottom: 42px; }
      h1 { max-width: 760px; font-size: clamp(2rem, 6vw, 3.5rem); line-height: 1.05; }
      h2 { margin-top: 42px; color: var(--help-accent); }
      p, li { color: var(--help-muted); font-size: 1.04rem; line-height: 1.75; }
      section { border-top: 1px solid var(--help-border); }
      li + li { margin-top: 10px; }
      a { color: var(--help-accent); }
      nav { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 36px; }
    </style>
    <script type="application/ld+json">${structuredData}</script>
  </head>
  <body>
    <main>
      <header>
        <p>Reference guide</p>
        <h1>${escapeHtml(helpContent.title)}</h1>
        <p>${escapeHtml(helpContent.subtitle)}</p>
      </header>
${helpContent.sections.map(renderSection).join('\n')}
      <nav aria-label="M68K interpreter links">
        <a href="${basePath}">Open the browser-based M68K interpreter</a>
        <a href="https://smysnk.com/nibbles">Play Nibbles 68000</a>
        <a href="https://smysnk.com/blog/projects-section-is-now-live">Read the project history</a>
        <a href="https://github.com/smysnk/m68k-interpreter">View source on GitHub</a>
      </nav>
    </main>
  </body>
</html>
`;
};

export const renderRedirectPage = ({ targetUrl, canonicalUrl = targetUrl }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,follow" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}" />
    <title>Moved to smysnk.com</title>
  </head>
  <body>
    <p>This page has moved to <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>.</p>
    <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
  </body>
</html>
`;

export const renderStaticPages = async ({ outDirectory, basePathValue, canonicalOrigin }) => {
  const indexPath = path.join(outDirectory, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, injectLandingContent(indexHtml, basePathValue), 'utf8');

  const basePath = normalizeBasePath(basePathValue);
  if (basePath !== '/m68k-interpreter') return;

  const helpContent = JSON.parse(await readFile(
    path.join(ideDirectory, 'src/content/helpContent.json'),
    'utf8',
  ));
  const cssAssetName = (await readdir(path.join(outDirectory, 'assets')))
    .find((assetName) => /^[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.css$/.test(assetName));
  if (!cssAssetName) {
    throw new Error('Built IDE output is missing its content-hashed stylesheet.');
  }
  const helpDirectory = path.join(outDirectory, 'help');
  await mkdir(helpDirectory, { recursive: true });
  await writeFile(path.join(helpDirectory, 'index.html'), renderHelpPage({
    helpContent,
    basePathValue: basePath,
    canonicalOrigin,
    cssAssetPath: `../assets/${cssAssetName}`,
  }), 'utf8');
  await writeFile(path.join(outDirectory, 'help.html'), renderRedirectPage({
    targetUrl: `${String(canonicalOrigin).replace(/\/+$/, '')}${basePath}/help`,
  }), 'utf8');
};

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  await renderStaticPages({
    outDirectory: path.resolve(process.argv[2] || path.join(ideDirectory, 'out')),
    basePathValue: process.env.VITE_BASE_PATH || '/',
    canonicalOrigin: process.env.STATIC_CANONICAL_ORIGIN || 'https://smysnk.com',
  });
}
