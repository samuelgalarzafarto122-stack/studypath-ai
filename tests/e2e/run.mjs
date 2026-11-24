// End-to-end tests in a real browser (Chromium via Playwright).
//   node tools/serve.mjs . 8080 &   then   node tests/e2e/run.mjs http://localhost:8080/
//   node tools/serve.mjs docs 8090 & then  node tests/e2e/run.mjs http://localhost:8090/ --offline
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).

import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8080/';
const OFFLINE = process.argv.includes('--offline');
const SHOTS = process.argv.find((a) => a.startsWith('--shots='))?.slice(8) || '';

let pass = 0;
let fail = 0;
const ok = (name) => {
  pass++;
  console.log(`  ✓ ${name}`);
};
const bad = (name, info) => {
  fail++;
  console.log(`  ✗ ${name}${info ? `\n      ${String(info).split('\n').join('\n      ')}` : ''}`);
};
let activePage = null; // the page the current group of steps runs on
let exportFile = ''; // the "Download my data" file, used again to test moving to a new device
async function step(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(name, e.message);
    // don't let one failure break the next steps: close any open sheet or dialog
    if (activePage) {
      await activePage.keyboard.press('Escape').catch(() => {});
      await activePage.evaluate(() => document.querySelectorAll('.scrim').forEach((x) => x.remove())).catch(() => {});
    }
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const isoIn = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function go(page, hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(250);
}

async function closeToasts(page) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
}

async function tutorSend(page, text) {
  const before = await page.locator('.msg.tutor').count();
  await page.fill('#tutor-input', text);
  await page.click('form[data-form="tutor-send"] button[type="submit"]');
  await page.waitForFunction((n) => document.querySelectorAll('.msg.tutor:not(.typing)').length > n && !document.getElementById('pending-bubble'), before, { timeout: 8000 });
  return (await page.locator('.msg.tutor').last().innerText()).trim();
}

// ---------------------------------------------------------------- a new student, start to finish
async function newStudent(browser) {
  console.log('\nA new student, start to finish (computer)');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  activePage = page;
  const errors = watch(page);
  await page.goto(BASE);

  await step('welcome screen opens', async () => {
    await page.waitForSelector('[data-action="onb-start"]', { timeout: 8000 });
  });

  await step('privacy step requires both required boxes', async () => {
    await page.click('[data-action="onb-start"]');
    await page.click('form[data-form="onb-privacy"] button[type="submit"]');
    await page.waitForSelector('.error-text[role="alert"]');
    await page.check('#ob-privacy');
    await page.check('#ob-age');
    await page.click('form[data-form="onb-privacy"] button[type="submit"]');
    await page.waitForSelector('#ob-nick');
  });

  await step('about you, classes and schedule', async () => {
    await page.fill('#ob-nick', 'Sam');
    await page.selectOption('#ob-grade', '11');
    await page.fill('#ob-goal', '85');
    await page.click('form[data-form="onb-about"] button[type="submit"]');
    await page.waitForSelector('#ob-cn-0');
    await page.fill('#ob-cn-0', 'Algebra 2');
    await page.fill('#ob-cg-0', '72');
    await page.fill('#ob-cn-1', 'Biology');
    await page.fill('#ob-cg-1', '88');
    await page.click('form[data-form="onb-classes"] button[type="submit"]');
    await page.waitForSelector('form[data-form="onb-schedule"]');
    await page.click('form[data-form="onb-schedule"] button[type="submit"]');
    await page.waitForSelector('form[data-form="onb-finish"]');
    await page.click('form[data-form="onb-finish"] button[type="submit"]');
  });

  await step("lands on Today with a plan for today's study time", async () => {
    await page.waitForSelector('#main h1');
    expect((await page.innerText('#main h1')).includes('Sam'), 'greeting should use the nickname');
    await closeToasts(page);
  });

  await step('grades: two classes with their averages', async () => {
    await go(page, '#grades');
    expect((await page.locator('.class-row').count()) === 2, 'expected 2 classes');
    const txt = await page.innerText('#main');
    expect(txt.includes('Algebra 2') && txt.includes('72'), 'Algebra 2 at 72 should show');
  });

  await step('a low grade lowers the average and sends a grade alert', async () => {
    await page.click('#main [data-action="add-grade"]');
    await page.waitForSelector('#grade-form');
    await page.fill('#g-title', 'Quiz 1');
    await page.fill('#g-score', '55');
    await page.click('#grade-form button[type="submit"]');
    await page.waitForTimeout(300);
    const txt = await page.innerText('#main');
    expect(!txt.includes('72.0') && txt.includes('Quiz 1'), 'Quiz 1 should be listed and the average updated');
    await go(page, '#inbox');
    const inbox = await page.innerText('#main');
    expect(/Algebra 2 dropped|Algebra 2/.test(inbox) && /dropped|low/i.test(inbox), `inbox should have a grade alert, got: ${inbox.slice(0, 200)}`);
    await closeToasts(page);
  });

  await step('adding a test puts it in upcoming tests and on top of the plan', async () => {
    await go(page, '#grades');
    await page.click('#main [data-action="add-test"]');
    await page.waitForSelector('.sheet input[name="title"]');
    await page.fill('.sheet input[name="title"]', 'Unit 3 test');
    await page.fill('.sheet input[name="date"]', isoIn(3));
    await page.click('.sheet button[type="submit"]');
    await page.waitForTimeout(300);
    expect((await page.innerText('#main')).includes('Unit 3 test'), 'test should be listed');
    await go(page, '#plan');
    const first = await page.locator('.session').first().innerText();
    expect(first.includes('Algebra 2'), `first session should be Algebra 2, got: ${first}`);
    await closeToasts(page);
  });

  await step('study timer: start, pause, resume, stop', async () => {
    // starting opens the full timer right away
    await page.locator('.session [data-action="start-timer"]').first().click();
    await page.waitForSelector('.sheet [data-sheet-action="pause"]', { timeout: 4000 });
    await page.click('.sheet [data-sheet-action="pause"]');
    await page.waitForTimeout(200);
    expect((await page.innerText('.sheet [data-pause]')).includes('Resume'), 'pause should switch to Resume');
    await page.click('.sheet [data-sheet-action="pause"]');
    // closing it leaves a small timer bar on every screen; tapping it opens the timer again
    await page.click('.sheet [data-close]');
    await page.waitForSelector('#timer-slot .timer-bar [data-timer-left]', { timeout: 4000 });
    await page.click('#timer-slot [data-action="open-timer"]');
    await page.click('.sheet [data-sheet-action="finish"]');
    await page.waitForSelector('.sheet button[type="submit"]');
    await page.click('.sheet button[type="submit"]');
    await page.waitForTimeout(300);
    expect((await page.locator('#timer-slot [data-timer-left]').count()) === 0, 'timer should be gone');
  });

  await step('logging a past session adds study time', async () => {
    await page.click('#main [data-action="log-session"]');
    await page.waitForSelector('#l-min');
    await page.fill('#l-min', '30');
    await page.click('.sheet button[type="submit"]');
    await page.waitForTimeout(300);
    await go(page, '#progress');
    expect((await page.innerText('#main')).includes('30m'), 'progress should show 30 minutes');
    await closeToasts(page);
  });

  await step('tutor gives a hint, never the answer, and checks the answer', async () => {
    await go(page, '#tutor');
    const r1 = await tutorSend(page, '3x + 7 = 22');
    expect(!/x\s*=\s*5\b/.test(r1), `first reply leaked the answer: ${r1}`);
    const r2 = await tutorSend(page, 'just tell me the answer');
    expect(!/x\s*=\s*5\b/.test(r2), `asked for the answer and got it: ${r2}`);
    const r3 = await tutorSend(page, 'x = 4');
    expect(!/solved/i.test(r3), `a wrong answer must not be marked solved: ${r3}`);
    const r4 = await tutorSend(page, 'x = 5');
    expect(/solved/i.test(r4) || /correct|right|nailed|yes/i.test(r4), `the right answer should be confirmed: ${r4}`);
  });

  await step('tutor points to real help for a crisis message', async () => {
    const r = await tutorSend(page, 'I feel like I want to die');
    expect(/988|counselor|trusted adult|crisis/i.test(r), `crisis reply should point to help: ${r}`);
  });

  await step('weekly check-in saves', async () => {
    await go(page, '#progress');
    await page.click('#main [data-action="checkin"]');
    await page.waitForSelector('#ci-mood-4', { state: 'attached' });
    await page.click('label:has(#ci-mood-4)');
    await page.click('label:has(#ci-confidence-3)');
    await page.click('label:has(#ci-stress-2)');
    await page.click('.sheet button[type="submit"]');
    await page.waitForSelector('.toast:has-text("Check-in saved")');
    await closeToasts(page);
  });

  await step('dark theme switch', async () => {
    await go(page, '#profile');
    await page.click('[data-action="theme"][data-theme="dark"]');
    // the screen redraws on the next frame
    const dark = await page
      .waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 3000 })
      .then(() => true, () => false);
    expect(dark, 'theme should be dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg !== 'rgb(238, 241, 246)', 'background should change in dark mode');
    await page.click('[data-action="theme"][data-theme="system"]');
  });

  await step('download my data (JSON) has the grades', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-json"]')]);
    exportFile = path.join(os.tmpdir(), `studypath-e2e-${Date.now()}.json`);
    await dl.saveAs(exportFile);
    const data = JSON.parse(await readFile(exportFile, 'utf8'));
    expect(JSON.stringify(data).includes('Quiz 1'), 'export should include Quiz 1');
  });

  await step('data is still there after closing and reopening', async () => {
    await page.reload();
    await page.waitForSelector('#main h1');
    await go(page, '#grades');
    expect((await page.innerText('#main')).includes('Quiz 1'), 'Quiz 1 should survive a reload');
  });

  await step('sample data mode keeps the real data aside', async () => {
    await go(page, '#profile');
    await page.click('[data-action="start-demo"]');
    await page.waitForSelector('.demo-banner');
    await page.click('.demo-banner [data-action="exit-demo"]');
    await page.waitForTimeout(400);
    await go(page, '#grades');
    expect((await page.innerText('#main')).includes('Quiz 1'), 'real data should come back after the demo');
  });

  await step('delete everything returns to the welcome screen', async () => {
    await go(page, '#profile');
    await page.click('[data-action="delete-all"]');
    await page.click('.sheet [data-sheet-action="yes"]');
    await page.waitForSelector('[data-action="onb-start"]', { timeout: 6000 });
  });

  await step('a new device: "Bring your data from a file" restores everything', async () => {
    expect(exportFile, 'no export file from the earlier step');
    await page.setInputFiles('#import-file', exportFile);
    await page.waitForSelector('#main h1', { timeout: 6000 });
    expect((await page.innerText('#main h1')).includes('Sam'), 'the nickname should come back');
    await go(page, '#grades');
    expect((await page.innerText('#main')).includes('Quiz 1'), 'Quiz 1 should come back');
    await closeToasts(page);
  });

  await step('importing something else is refused politely', async () => {
    await go(page, '#profile');
    const bogus = path.join(os.tmpdir(), `not-studypath-${Date.now()}.json`);
    await writeFile(bogus, JSON.stringify({ hello: 'world' }));
    await page.setInputFiles('#import-file', bogus);
    await page.waitForSelector('.toast', { timeout: 4000 });
    expect(/not a StudyPath export/.test(await page.innerText('.toasts')), 'expected a "not a StudyPath export" message');
    await go(page, '#grades');
    expect((await page.innerText('#main')).includes('Quiz 1'), 'the data must be untouched');
    await closeToasts(page);
  });

  await step('no errors in the browser console', async () => {
    expect(!errors.length, errors.join('\n'));
  });
  await ctx.close();
}

// ---------------------------------------------------------------- phone layout
async function phone(browser) {
  console.log('\nPhone layout (iPhone 13 size)');
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  activePage = page;
  const errors = watch(page);
  await page.goto(BASE);
  await page.click('[data-action="onb-demo"]');
  await page.waitForSelector('.tabbar');
  for (const [tab, hash] of [['Grades', '#grades'], ['Plan', '#plan'], ['Tutor', '#tutor'], ['Progress', '#progress'], ['Today', '#today']]) {
    await step(`${tab} tab opens and fits the screen`, async () => {
      await page.click(`.tabbar a[href="${hash}"]`);
      await page.waitForTimeout(300);
      const fit = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(fit, 'page is wider than the screen');
      expect((await page.getAttribute(`.tabbar a[href="${hash}"]`, 'aria-current')) === 'page', 'tab should be marked current');
    });
  }
  for (const hash of ['#week', '#program', '#profile', '#inbox', '#research']) {
    await step(`${hash} fits the screen`, async () => {
      await go(page, hash);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page is wider than the screen');
    });
  }
  await step('tutor message box is visible above the tab bar', async () => {
    await go(page, '#tutor');
    await closeToasts(page);
    const box = await page.locator('#tutor-input').boundingBox();
    const bar = await page.locator('.tabbar').boundingBox();
    expect(box && bar && box.y + box.height <= bar.y + 1, `input at ${box?.y}, tab bar at ${bar?.y}`);
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-today.png` });
  await step('no errors in the browser console', async () => {
    expect(!errors.length, errors.join('\n'));
  });
  await ctx.close();
}

// ---------------------------------------------------------------- installable + offline (built app)
async function offline(browser) {
  console.log('\nInstallable and works offline (built app)');
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  activePage = page;
  const errors = watch(page);
  await page.goto(BASE);
  await step('manifest and service worker are in place', async () => {
    const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
    expect(manifest.display === 'standalone' && manifest.icons.some((i) => i.sizes === '512x512'), 'manifest needs standalone + 512 icon');
    await page.evaluate(() => navigator.serviceWorker.ready);
  });
  await step('opens with no internet after the first visit', async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForTimeout(500);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('[data-action="onb-start"], #main h1', { timeout: 8000 });
    await page.click('[data-action="onb-demo"]');
    await page.waitForSelector('#main h1');
    await ctx.setOffline(false);
  });
  await step('no errors in the browser console', async () => {
    const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(e));
    expect(!real.length, real.join('\n'));
  });
  await ctx.close();
}

const browser = await chromium.launch();
try {
  await newStudent(browser);
  await phone(browser);
  if (OFFLINE) await offline(browser);
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
