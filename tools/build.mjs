// Build StudyPath for publishing.
//   node tools/build.mjs            → docs/      (the installable web app, for GitHub Pages)
//                                    dist/studypath-online.html (one-file online demo for claude.ai)
// The app also runs straight from the source folder (node tools/serve.mjs) without building.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const dist = path.join(root, 'dist');
const r = (...p) => path.join(root, ...p);

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function bundle() {
  const res = await build({
    entryPoints: [r('src/main.js')],
    bundle: true,
    format: 'esm',
    target: ['es2020', 'safari15', 'chrome100', 'firefox100'],
    minify: true,
    legalComments: 'none',
    write: false,
    logLevel: 'warning',
  });
  return res.outputFiles[0].text;
}

async function minifyCSS(css) {
  const res = await build({ stdin: { contents: css, loader: 'css' }, minify: true, write: false, logLevel: 'warning' });
  return res.outputFiles[0].text;
}

// ---------- 1. docs/: the installable app ----------
async function buildDocs() {
  // keep the cloud keys if they were already filled in on GitHub (docs/config.js)
  let keepConfig = null;
  if (existsSync(path.join(docs, 'config.js'))) {
    const cur = await readFile(path.join(docs, 'config.js'), 'utf8');
    if (/supabaseUrl:\s*'https:\/\//.test(cur)) keepConfig = cur;
  }
  await rm(docs, { recursive: true, force: true });
  await mkdir(path.join(docs, 'assets'), { recursive: true });

  const js = await bundle();
  const css = await minifyCSS(await readFile(r('assets/styles.css'), 'utf8'));
  const jsName = `app-${hash(js)}.js`;
  const cssName = `styles-${hash(css)}.css`;
  await writeFile(path.join(docs, jsName), js);
  await writeFile(path.join(docs, 'assets', cssName), css);
  await cp(r('assets/fonts'), path.join(docs, 'assets/fonts'), { recursive: true });
  await cp(r('assets/icons'), path.join(docs, 'assets/icons'), { recursive: true });
  await cp(r('vendor'), path.join(docs, 'vendor'), { recursive: true });
  await cp(r('manifest.webmanifest'), path.join(docs, 'manifest.webmanifest'));
  await writeFile(path.join(docs, 'config.js'), keepConfig || (await readFile(r('config.js'), 'utf8')));
  await writeFile(path.join(docs, '.nojekyll'), '');

  let index = await readFile(r('index.html'), 'utf8');
  index = index
    .replace('href="assets/styles.css"', `href="assets/${cssName}"`)
    .replace('<script type="module" src="src/main.js"></script>', `<script type="module" src="${jsName}"></script>`);
  if (!index.includes(jsName) || !index.includes(cssName)) throw new Error('index.html did not match the expected script/style tags');
  await writeFile(path.join(docs, 'index.html'), index);

  // service worker: a new version name and the exact files to keep offline
  const version = `studypath-${hash(js + css + index)}`;
  const precache = [
    './',
    './index.html',
    `./${jsName}`,
    `./assets/${cssName}`,
    './config.js',
    './manifest.webmanifest',
    './assets/fonts/inter-latin.woff2',
    './assets/fonts/space-grotesk-latin.woff2',
    './assets/icons/icon-192.png',
    './assets/icons/badge-96.png',
    './assets/icons/favicon.svg',
  ];
  let sw = await readFile(r('sw.js'), 'utf8');
  sw = sw
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
    .replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`);
  if (!sw.includes(version)) throw new Error('sw.js did not match the expected VERSION line');
  await writeFile(path.join(docs, 'sw.js'), sw);

  const size = (await stat(path.join(docs, jsName))).size;
  console.log(`docs/ ready: ${jsName} (${kb(size)}), ${cssName}, sw ${version}`);
}

// ---------- 2. dist/studypath-online.html: the one-file online demo (claude.ai artifact) ----------
async function buildArtifact() {
  await mkdir(dist, { recursive: true });
  const js = (await bundle()).replace(/<\/script/gi, '<\\/script');
  let css = await readFile(r('assets/styles.css'), 'utf8');
  // fonts inside the file (latin only; other characters fall back to system fonts)
  const font = async (f) => `data:font/woff2;base64,${(await readFile(r('assets/fonts', f))).toString('base64')}`;
  css = css
    .replace(/@font-face \{[^}]*latin-ext\.woff2[^}]*\}\n?/g, '')
    .replace('url("fonts/inter-latin.woff2")', `url("${await font('inter-latin.woff2')}")`)
    .replace('url("fonts/space-grotesk-latin.woff2")', `url("${await font('space-grotesk-latin.woff2')}")`);
  css = await minifyCSS(css);
  const html = `<title>StudyPath AI</title>
<meta name="description" content="A 10-week study coach for high school students: a plan built from your grades, an AI tutor that gives hints instead of answers, reminders, and progress you can see.">
<meta name="color-scheme" content="light dark">
<style>${css}</style>
<div id="app"><div class="boot">Loading StudyPath…</div></div>
<noscript><p style="padding:24px;font-family:system-ui">StudyPath needs JavaScript turned on.</p></noscript>
<script>globalThis.STUDYPATH_MODE = 'artifact'; window.STUDYPATH_CONFIG = {};</script>
<script type="module">${js}</script>
`;
  const out = path.join(dist, 'studypath-online.html');
  await writeFile(out, html);
  console.log(`dist/studypath-online.html ready (${kb(Buffer.byteLength(html))})`);
}

await buildDocs();
await buildArtifact();
