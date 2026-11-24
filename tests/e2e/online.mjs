// Tests the one-file online demo (dist/studypath-online.html) with a stand-in for claude.ai:
// a fake `claude.use()` that provides db, user, downloads and sample the way the real page gets them.
// Checks: data is backed up to the viewer's private space, a "new device" gets it back, research
// summaries hold numbers only, the owner sees totals, a view-only visitor stays on this device,
// the tutor uses the AI reply (and the leak guard), and "Download my data" goes through downloads.
//   node tools/build.mjs && node tests/e2e/online.mjs

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = 'https://studypath.test/';

let pass = 0;
let fail = 0;
let activePage = null;
async function step(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n      ${String(e.message).split('\n').join('\n      ')}`);
    if (activePage) await activePage.keyboard.press('Escape').catch(() => {});
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// The page as the claude.ai viewer serves it: the published file inside a small skeleton.
const file = await readFile(path.join(root, 'dist/studypath-online.html'), 'utf8');
const page_html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${file}</body></html>`;

// Fake claude.ai runtime. The "cloud" lives in localStorage under __fake_cloud so it survives a
// reload and can be shared with a second browser context (a new device) through addInitScript.
function fakeRuntime({ uid, canWrite = true, owner = true, cloud = null, aiReply = null }) {
  const KEY = '__fake_cloud';
  if (cloud) localStorage.setItem(KEY, cloud);
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = (m) => localStorage.setItem(KEY, JSON.stringify(m));
  const segs = (p) => p.split('/').filter(Boolean);
  const deny = () => Object.assign(new Error('not allowed'), { code: 'invalid_argument' });
  const writable = (p) => canWrite && (p.startsWith(`data/users/${uid}/`) || p === `research/${uid}`);
  const readable = (p) => p.startsWith(`data/users/${uid}/`) || p === `research/${uid}` || (owner && p.startsWith('research/'));
  const snap = (p, m) => ({ id: segs(p).pop(), exists: p in m, data: () => (p in m ? structuredClone(m[p]) : undefined) });
  const docRef = (p) => ({
    id: segs(p).pop(),
    path: p,
    async get() {
      const m = load();
      return readable(p) ? snap(p, m) : { id: segs(p).pop(), exists: false, data: () => undefined };
    },
    async set(d) {
      if (!writable(p)) throw deny();
      const m = load();
      m[p] = structuredClone(d);
      save(m);
      window.__writes = (window.__writes || 0) + 1;
    },
    async delete() {
      if (!writable(p)) throw deny();
      const m = load();
      delete m[p];
      save(m);
    },
  });
  const collRef = (p) => ({
    doc: (id) => docRef(`${p}/${id}`),
    async get() {
      const m = load();
      const n = segs(p).length + 1;
      const docs = Object.keys(m)
        .filter((k) => k.startsWith(`${p}/`) && segs(k).length === n && readable(k))
        .map((k) => snap(k, m));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  const db = { doc: docRef, collection: collRef };
  const user = {
    id: async () => uid,
    can: async (name) => (name === 'data.write' ? canWrite : null),
    isOwner: async () => owner,
    canEdit: async () => owner,
  };
  const downloads = {
    async save({ filename, data }) {
      window.__download = { filename, data: typeof data === 'string' ? data : String(data) };
    },
  };
  const sample = async (input, opts = {}) => {
    window.__sampleCalls = (window.__sampleCalls || 0) + 1;
    window.__lastSampleInput = input;
    const text = aiReply || 'Good start. What could you do to both sides to get the x term by itself?';
    opts.onText?.({ text, delta: text });
    return { text, truncated: false };
  };
  const caps = { db, user, downloads, sample };
  globalThis.claude = { use: async (name) => caps[name] ?? null };
}

async function openOnline(browser, opts, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(URL, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: page_html }));
  await ctx.addInitScript(fakeRuntime, opts);
  const page = await ctx.newPage();
  activePage = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(URL);
  return { ctx, page, errors };
}

async function onboard(page, { cloud = true, research = true } = {}) {
  await page.waitForSelector('[data-action="onb-start"]', { timeout: 8000 });
  await page.click('[data-action="onb-start"]');
  await page.check('#ob-privacy');
  await page.check('#ob-age');
  if (cloud) await page.check('#ob-cloud');
  if (research) await page.check('#ob-research');
  await page.click('form[data-form="onb-privacy"] button[type="submit"]');
  await page.fill('#ob-nick', 'Robin');
  await page.selectOption('#ob-grade', '10');
  await page.fill('#ob-goal', '85');
  await page.click('form[data-form="onb-about"] button[type="submit"]');
  await page.fill('#ob-cn-0', 'Geometry');
  await page.fill('#ob-cg-0', '71');
  await page.click('form[data-form="onb-classes"] button[type="submit"]');
  await page.click('form[data-form="onb-schedule"] button[type="submit"]');
  await page.click('form[data-form="onb-finish"] button[type="submit"]');
  await page.waitForSelector('#main h1');
}

const cloudDump = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fake_cloud') || '{}'));
async function waitForSync(page, test, msg, timeout = 8000) {
  const ok = await page.waitForFunction(test, null, { timeout }).then(() => true, () => false);
  expect(ok, msg);
}

const browser = await chromium.launch();
console.log('\nOnline demo with claude.ai storage (stand-in)');

// 1) a signed-in student who can save
const A = await openOnline(browser, { uid: 'viewer_a', canWrite: true, owner: true });
let cloudCopy = '{}';
await step('onboarding works and the data is backed up to the private space', async () => {
  await onboard(A.page);
  await waitForSync(A.page, () => Object.keys(JSON.parse(localStorage.getItem('__fake_cloud') || '{}')).some((k) => k.startsWith('data/users/viewer_a/')), 'nothing was saved under data/users/viewer_a/');
  const keys = Object.keys(await cloudDump(A.page));
  expect(keys.every((k) => k.startsWith('data/users/viewer_a/') || k === 'research/viewer_a'), `saved outside the private space: ${keys.join(', ')}`);
});

await step('a new grade reaches the cloud', async () => {
  await A.page.evaluate(() => (location.hash = '#grades'));
  await A.page.click('#main [data-action="add-grade"]');
  await A.page.fill('#g-title', 'Triangles quiz');
  await A.page.fill('#g-score', '64');
  await A.page.click('#grade-form button[type="submit"]');
  await waitForSync(A.page, () => JSON.stringify(JSON.parse(localStorage.getItem('__fake_cloud') || '{}')).includes('Triangles quiz'), 'the grade never reached the cloud', 15000);
});

await step('the research summary has numbers only (no nickname, class names or text)', async () => {
  await waitForSync(A.page, () => 'research/viewer_a' in JSON.parse(localStorage.getItem('__fake_cloud') || '{}'), 'no research summary was written', 15000);
  const m = await cloudDump(A.page);
  const text = JSON.stringify(m['research/viewer_a']);
  expect(!/Robin|Geometry|Triangles/.test(text), `the summary leaks text: ${text.slice(0, 300)}`);
});

await step('the profile shows the backup as done', async () => {
  await A.page.evaluate(() => (location.hash = '#profile'));
  await A.page.waitForTimeout(400);
  const t = await A.page.innerText('#main');
  expect(/Backed up/.test(t), 'expected "Backed up" on the profile');
  cloudCopy = JSON.stringify(await cloudDump(A.page));
});

await step('the tutor asks Claude, and the answer guard still works', async () => {
  await A.page.evaluate(() => (location.hash = '#tutor'));
  await A.page.waitForSelector('#tutor-input');
  await A.page.fill('#tutor-input', '3x + 7 = 22');
  await A.page.click('form[data-form="tutor-send"] button[type="submit"]');
  await A.page.waitForFunction(() => (window.__sampleCalls || 0) > 0 && !document.getElementById('pending-bubble'), null, { timeout: 8000 });
  await A.page.waitForTimeout(300);
  const last = (await A.page.locator('.msg.tutor').last().innerText()).trim();
  expect(/both sides/.test(last), `expected the AI reply, got: ${last.slice(0, 200)}`);
  const input = await A.page.evaluate(() => window.__lastSampleInput);
  expect(Array.isArray(input) && input[input.length - 1].role === 'user', 'the AI call must end on a user turn');
  const roles = input.map((t) => t.role).join(',');
  expect(!/user,user|assistant,assistant/.test(roles), `turns must alternate: ${roles}`);
});

await step('download my data goes through the claude.ai downloads', async () => {
  await A.page.evaluate(() => (location.hash = '#profile'));
  await A.page.waitForTimeout(300);
  await A.page.click('[data-action="export-json"]');
  await A.page.waitForFunction(() => window.__download, null, { timeout: 5000 });
  const dl = await A.page.evaluate(() => window.__download);
  expect(/\.json$/.test(dl.filename) && dl.data.includes('Triangles quiz'), `unexpected download: ${dl.filename}`);
});

await step('the owner sees research totals (hidden below 5 students)', async () => {
  await A.page.evaluate(() => (location.hash = '#research'));
  await A.page.waitForTimeout(400);
  await A.page.click('[data-action="r-mode"][data-mode="real"]');
  await A.page.waitForTimeout(800);
  const t = await A.page.innerText('#main');
  expect(/at least 5|fewer than 5|5 or more|5 students/i.test(t), `expected the small-group notice, got: ${t.slice(0, 300)}`);
});

await step('no errors in the browser console', async () => {
  const bad = A.errors.filter((e) => !/favicon/i.test(e));
  expect(bad.length === 0, bad.join('\n'));
});
await A.ctx.close();

// 2) the same student on a new device: the data comes back from the cloud.
// Six more students' research summaries are added first, so the owner should now see totals.
{
  const { simulatedSummaries } = await import(path.join(root, 'src/logic/research.js'));
  const m = JSON.parse(cloudCopy);
  simulatedSummaries(6, 4).forEach((summary, i) => (m[`research/student_${i}`] = { summary, updatedAt: new Date().toISOString() }));
  cloudCopy = JSON.stringify(m);
}
const B = await openOnline(browser, { uid: 'viewer_a', canWrite: true, owner: true, cloud: cloudCopy });
await step('a new device gets the data back after turning on backup', async () => {
  await onboard(B.page, { cloud: true, research: false });
  await B.page.evaluate(() => (location.hash = '#grades'));
  const ok = await B.page
    .waitForFunction(() => document.querySelector('#main')?.innerText.includes('Triangles quiz'), null, { timeout: 15000 })
    .then(() => true, () => false);
  if (!ok) {
    await B.page.evaluate(() => (location.hash = '#today'));
    await B.page.evaluate(() => (location.hash = '#grades'));
    await B.page.waitForTimeout(600);
  }
  expect((await B.page.innerText('#main')).includes('Triangles quiz'), 'the grade from the first device did not come back');
});
await step('with 5 or more students sharing, the owner sees the totals', async () => {
  await B.page.evaluate(() => (location.hash = '#research'));
  await B.page.waitForTimeout(400);
  await B.page.click('[data-action="r-mode"][data-mode="real"]');
  const ok = await B.page
    .waitForFunction(() => /Real, anonymous data from \d+ students/.test(document.querySelector('#main')?.innerText || ''), null, { timeout: 6000 })
    .then(() => true, () => false);
  expect(ok, `expected real totals, got: ${(await B.page.innerText('#main')).slice(0, 300)}`);
});
await B.ctx.close();

// 3) a view-only visitor: the app works, the data stays on the device, no error loop
const C = await openOnline(browser, { uid: 'viewer_c', canWrite: false, owner: false });
await step('a view-only visitor can use the app, data stays on the device', async () => {
  await onboard(C.page);
  await C.page.evaluate(() => (location.hash = '#profile'));
  await C.page.waitForTimeout(800);
  const t = await C.page.innerText('#main');
  expect(/On this device only/.test(t) && /Contributor access/.test(t), `expected the on-this-device notice, got: ${t.slice(0, 400)}`);
  const writes = await C.page.evaluate(() => window.__writes || 0);
  expect(writes === 0, `a view-only visitor should not write (${writes} writes)`);
  const bad = C.errors.filter((e) => !/favicon|\[cloud\]/i.test(e));
  expect(bad.length === 0, bad.join('\n'));
});
await step('a view-only visitor does not see other students’ research', async () => {
  await C.page.evaluate(() => (location.hash = '#research'));
  await C.page.waitForTimeout(400);
  await C.page.click('[data-action="r-mode"][data-mode="real"]');
  await C.page.waitForTimeout(600);
  const t = await C.page.innerText('#main');
  expect(/Only the owner/i.test(t), `a visitor should be told only the owner sees totals, got: ${t.slice(0, 300)}`);
});
await C.ctx.close();

// 4) the AI tries to give the answer away: the guard replaces the reply with a hint
const D = await openOnline(browser, { uid: 'viewer_d', canWrite: true, owner: false, aiReply: 'Easy: subtract 7 and divide by 3, so x = 5.' });
await step('if the AI gives the answer away, the app swaps in a hint', async () => {
  await onboard(D.page, { cloud: false, research: false });
  await D.page.evaluate(() => (location.hash = '#tutor'));
  await D.page.waitForSelector('#tutor-input');
  await D.page.fill('#tutor-input', '3x + 7 = 22');
  await D.page.click('form[data-form="tutor-send"] button[type="submit"]');
  await D.page.waitForFunction(() => (window.__sampleCalls || 0) > 0 && !document.getElementById('pending-bubble'), null, { timeout: 8000 });
  await D.page.waitForTimeout(400);
  const last = (await D.page.locator('.msg.tutor').last().innerText()).trim();
  expect(!/x\s*=\s*5\b/.test(last), `the answer got through: ${last.slice(0, 200)}`);
});
await D.ctx.close();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
