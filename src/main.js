// App entry: loads data, draws the shell (sidebar on computers, tabs on phones), routes between
// screens, and wires every button through one delegated event handler.

import { store } from './state.js';
import { html, raw, todayISO } from './util.js';
import { IS_ARTIFACT } from './env.js';
import * as A from './actions.js';
import { currentWeek } from './logic/program.js';
import { startReminderLoop, notifyHooks, checkReminders } from './notify.js';
import { hydrateCharts, resetCharts, toggleSeries } from './ui/charts.js';
import { toast, snapshotForm, restoreForm, formData } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { gradeSheet, testSheet, classSheet, logSheet, checkinSheet } from './ui/forms.js';
import { renderTimerBar, openTimer, tickTimer } from './ui/timer.js';
import { initInstall, onInstallChange } from './install.js';
import { initCloud } from './cloud/index.js';

import today from './views/today.js';
import grades, { classView } from './views/grades.js';
import plan, { week, program } from './views/plan.js';
import tutor from './views/tutor.js';
import progress from './views/progress.js';
import profile, { inbox } from './views/profile.js';
import research from './views/research.js';
import onboarding from './views/onboarding.js';

const VIEWS = { today, grades, class: classView, plan, week, program, tutor, progress, profile, inbox, research };
const TABS = [
  { id: 'today', label: 'Today', icon: 'home', match: ['today'] },
  { id: 'grades', label: 'Grades', icon: 'grades', match: ['grades', 'class'] },
  { id: 'plan', label: 'Plan', icon: 'plan', match: ['plan', 'week', 'program'] },
  { id: 'tutor', label: 'Tutor', icon: 'tutor', match: ['tutor'] },
  { id: 'progress', label: 'Progress', icon: 'progress', match: ['progress', 'research'] },
];

const app = document.getElementById('app');
let route = parseRoute(location.hash);
let shellReady = false;
let currentDay = todayISO();
let frame = 0;

export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  if (!h) return { name: 'today', param: null };
  const m = h.match(/^(class|tutor)-(.+)$/);
  if (m) return { name: m[1], param: decodeURIComponent(m[2]) };
  const name = h.split(/[/?]/)[0];
  return { name: VIEWS[name] ? name : 'today', param: null };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const ctx = {
  get state() {
    return store.state;
  },
  get route() {
    return route;
  },
  go,
  render: () => render(),
};

// ---------- shell ----------
function initials(name) {
  const n = String(name || '').trim();
  if (!n) return 'ME';
  const parts = n.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0, 2)).toUpperCase();
}

function logo() {
  return raw(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="18" r="2.3"/><circle cx="18" cy="6" r="2.3"/><path d="M8.3 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.7"/></svg>',
  );
}

function shellHTML() {
  return html`
    <a class="skip-link" href="#main" data-action="skip">Skip to content</a>
    <div class="app">
      <nav class="sidebar" aria-label="Main">
        <a class="brand" href="#today"><span class="brand-mark">${logo()}</span>StudyPath AI</a>
        ${TABS.map((t) => html`<a class="nav-link" href="#${t.id}" data-nav="${t.id}">${icon(t.icon)}${t.label}</a>`)}
        <div class="spacer"></div>
        <a class="nav-link" href="#inbox" data-nav="inbox">${icon('bell')}Notifications<span class="count" data-inbox-count hidden></span></a>
        <a class="nav-link" href="#profile" data-nav="profile">${icon('gear')}Profile & settings</a>
        <a class="me" href="#profile" data-me></a>
      </nav>
      <div class="main">
        <header class="topbar" id="topbar">
          <span class="brand-mark mobile-only" aria-hidden="true">${logo()}</span>
          <div class="title"><span class="tb-brand">StudyPath AI</span><span class="tb-title" id="page-title"></span></div>
          <a class="icon-btn" href="#inbox" aria-label="Notifications" data-bell>${icon('bell')}<span class="badge" data-inbox-badge hidden></span></a>
          <a class="avatar mobile-only" href="#profile" aria-label="Profile and settings" data-avatar></a>
        </header>
        <main id="main" class="content" tabindex="-1"></main>
      </div>
      <nav class="tabbar" aria-label="Main">
        ${TABS.map((t) => html`<a class="tab" href="#${t.id}" data-nav="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
      </nav>
    </div>
    <div id="timer-slot"></div>`;
}

function updateShell(view) {
  const s = store.state;
  const tab = TABS.find((t) => t.match.includes(route.name));
  for (const a of app.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === (tab ? tab.id : route.name);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const title = typeof view.title === 'function' ? view.title(s, route) : view.title || 'StudyPath AI';
  const pt = app.querySelector('#page-title');
  if (pt) pt.textContent = title;
  document.title = route.name === 'today' ? 'StudyPath AI' : `${title} · StudyPath AI`;
  const unread = s.inbox.filter((n) => !n.read).length;
  const badge = app.querySelector('[data-inbox-badge]');
  const count = app.querySelector('[data-inbox-count]');
  for (const b of [badge, count]) {
    if (!b) continue;
    b.hidden = !unread;
    b.textContent = unread > 9 ? '9+' : String(unread);
  }
  app.querySelector('[data-bell]')?.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
  const av = app.querySelector('[data-avatar]');
  if (av) {
    av.className = `avatar mobile-only av-${s.profile.avatar || 'blue'}`;
    av.textContent = initials(s.profile.nickname);
  }
  app.querySelector('.app')?.classList.toggle('demo', Boolean(s.demo));
  const me = app.querySelector('[data-me]');
  if (me) {
    me.innerHTML = String(html`<span class="avatar av-${s.profile.avatar || 'blue'}">${initials(s.profile.nickname)}</span>
      <span class="grow"><span class="strong ellipsis" style="display:block">${s.profile.nickname || 'Student'}</span><span class="tiny muted">Grade ${s.profile.gradeLevel} · ${s.demo ? 'Sample data' : `Week ${currentWeek(s)} of 10`}</span></span>`);
  }
}

function demoBanner() {
  const s = store.state;
  if (!s.demo) return '';
  return html`<div class="demo-banner">${icon('info')}<span><b>Sample data.</b> “${s.profile.nickname}” is a made-up student so you can explore. Nothing here is real.</span>
    <button class="btn small secondary" type="button" data-action="exit-demo">Exit demo</button></div>`;
}

function applyTheme() {
  const t = store.state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg) for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', bg);
}

// ---------- render ----------
let lastRouteKey = '';

function render() {
  cancelAnimationFrame(frame);
  frame = 0;
  const s = store.state;
  applyTheme();
  if (!s.onboarded) {
    shellReady = false;
    resetCharts();
    const snap = snapshotForm(app);
    app.innerHTML = String(onboarding.render(s, route, ctx));
    restoreForm(app, snap);
    onboarding.mounted?.(app, s, route, ctx);
    return;
  }
  if (!shellReady) {
    app.innerHTML = String(shellHTML());
    shellReady = true;
    lastRouteKey = '';
  }
  const view = VIEWS[route.name] || today;
  const main = app.querySelector('#main');
  const key = `${route.name}:${route.param || ''}`;
  const routeChanged = key !== lastRouteKey;
  const snap = routeChanged ? null : snapshotForm(main);
  resetCharts();
  main.innerHTML = String(html`${demoBanner()}${view.render(s, route, ctx)}`);
  if (snap) restoreForm(main, snap);
  updateShell(view);
  hydrateCharts(main);
  view.mounted?.(main, s, route, ctx, { routeChanged });
  renderTimerBar(app.querySelector('#timer-slot'));
  if (routeChanged) {
    lastRouteKey = key;
    window.scrollTo(0, 0);
  }
  onScroll();
}

function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render();
  });
}

// ---------- events ----------
const GLOBAL_ACTIONS = {
  'add-grade': (el) => gradeSheet({ classId: el.dataset.class }),
  'edit-grade': (el) => gradeSheet({ gradeId: el.dataset.id }),
  'add-test': (el) => testSheet({ classId: el.dataset.class }),
  'edit-test': (el) => testSheet({ testId: el.dataset.id }),
  'add-class': () => classSheet(),
  'edit-class': (el) => classSheet({ classId: el.dataset.id }),
  'log-session': (el) => logSheet({ classId: el.dataset.class }),
  checkin: () => checkinSheet(),
  'start-timer': (el) => {
    if (store.state.timer) return openTimer();
    A.startTimer({
      classId: el.dataset.class || null,
      method: el.dataset.method || 'custom',
      minutes: Number(el.dataset.minutes) || store.state.settings.sessionMinutes,
      title: el.dataset.title || '',
      planDate: el.dataset.planDate || null,
      planSessionId: el.dataset.planSession || null,
    });
    openTimer();
  },
  'open-timer': () => openTimer(),
  'exit-demo': async () => {
    await A.exitDemo();
    go('#today');
    toast('You left the demo.', { iconName: 'info' });
  },
  'reset-demo': () => {
    A.resetDemo();
    toast('Sample data reset.', { iconName: 'refresh' });
  },
  'mark-read': (el) => A.markInboxRead(el.dataset.id),
  skip: (el, e) => {
    e.preventDefault();
    app.querySelector('#main')?.focus();
  },
};

function viewFor() {
  if (!store.state.onboarded) return onboarding;
  return VIEWS[route.name] || today;
}

document.addEventListener('click', (e) => {
  const legend = e.target.closest('[data-legend]');
  if (legend) {
    toggleSeries(legend);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('.scrim')) return;
  const name = el.dataset.action;
  const view = viewFor();
  const fn = view.actions?.[name] || GLOBAL_ACTIONS[name];
  if (!fn) return;
  if (el.tagName === 'A' && !el.getAttribute('href')?.startsWith('#')) return;
  if (el.tagName === 'BUTTON' || el.dataset.prevent != null) e.preventDefault();
  fn(el, e, ctx);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form || form.closest('.scrim')) return;
  e.preventDefault();
  const fn = viewFor().forms?.[form.dataset.form];
  if (fn) fn(formData(form), form, e, ctx);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || el.closest('.scrim')) return;
  const fn = viewFor().changes?.[el.dataset.change];
  if (fn) fn(el, e, ctx);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el || el.closest('.scrim')) return;
  const fn = viewFor().inputs?.[el.dataset.input];
  if (fn) fn(el, e, ctx);
});

document.addEventListener('keydown', (e) => {
  const el = e.target.closest('[data-keydown]');
  if (!el) return;
  const fn = viewFor().keys?.[el.dataset.keydown];
  if (fn) fn(el, e, ctx);
});

window.addEventListener('hashchange', () => {
  const next = parseRoute(location.hash);
  const leaving = route;
  route = next;
  if (leaving.name !== next.name || leaving.param !== next.param) {
    VIEWS[leaving.name]?.leave?.();
  }
  render();
  // move focus to the new screen for keyboard and screen-reader users
  if (store.state.onboarded) app.querySelector('#main')?.focus({ preventScroll: true });
});

function onScroll() {
  const tb = app.querySelector('#topbar');
  if (!tb) return;
  tb.classList.toggle('scrolled', window.scrollY > 4);
  // phones: the page's own big title scrolls away, then its name appears in the top bar
  tb.classList.toggle('titled', window.scrollY > 64);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- boot ----------
async function boot() {
  await store.load();
  store.subscribe((change) => {
    if (change.coll === 'events') return;
    if (change.coll === 'timer') {
      renderTimerBar(app.querySelector('#timer-slot'));
      if (route.name === 'plan' || route.name === 'today') scheduleRender();
      return;
    }
    scheduleRender();
  });
  notifyHooks.onInApp = (n) => toast(n.body, { title: n.title, iconName: n.type === 'grades' ? 'down' : n.type === 'tests' ? 'calendar' : 'bell', href: n.url, linkLabel: 'View', timeout: 7000 });
  notifyHooks.onEvent = (type, data) => A.track(type, data);
  if (store.state.onboarded) A.refreshPlan();
  render();
  A.track('app_open', { mode: IS_ARTIFACT ? 'artifact' : 'pwa', standalone: matchMedia('(display-mode: standalone)').matches });
  startReminderLoop();
  initInstall();
  onInstallChange(scheduleRender);
  initCloud({ toast, render: scheduleRender }).catch((e) => console.warn('cloud', e));
  setInterval(() => {
    tickTimer();
    const d = todayISO();
    if (d !== currentDay) {
      currentDay = d;
      A.refreshPlan(d);
      scheduleRender();
    }
  }, 1000);
  if (!IS_ARTIFACT && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate' && e.data.url) {
        go(e.data.url);
        checkReminders(); // picks up the tap the worker just recorded
      }
    });
  }
}

boot().catch((e) => {
  console.error(e);
  app.innerHTML = String(html`<div class="boot"><div class="center stack"><b>StudyPath could not start.</b><span class="muted">${e.message}</span><button class="btn" onclick="location.reload()">Try again</button></div></div>`);
});
