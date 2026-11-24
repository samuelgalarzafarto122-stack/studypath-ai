// Notifications.
// 1. Every notification lands in the in-app inbox (bell icon), so nothing is lost.
// 2. System notifications (phone/computer) are shown when the student turned them on and the
//    browser allows it, outside quiet hours.
// 3. While the app is open, a 30-second loop fires reminders that are due. The next 7 days of
//    reminders are saved for the service worker, which can show them with Periodic Background
//    Sync (installed app on Chrome/Edge) and, when the cloud push server is set up, Web Push.

import { store } from './state.js';
import { idbGet, idbSet } from './idb.js';
import { computeSchedule, dueItems, pruneFired, inQuietHours } from './logic/reminders.js';
import { uid } from './util.js';
import { IS_ARTIFACT, IS_IOS, isStandalone } from './env.js';

export const ICON = 'assets/icons/icon-192.png';
export const BADGE = 'assets/icons/badge-96.png';
const LOOP_MS = 30 * 1000;

/** Set by main.js: called when a notification arrives while the student is looking at the app. */
export const notifyHooks = { onInApp: null, onEvent: null };

export function support() {
  const hasSW = !IS_ARTIFACT && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  return {
    notifications: typeof Notification !== 'undefined' && !IS_ARTIFACT,
    serviceWorker: hasSW,
    periodicSync: hasSW && typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype,
    push: hasSW && typeof PushManager !== 'undefined',
    standalone: isStandalone(),
    ios: IS_IOS,
    // iPhone/iPad only allow notifications for apps added to the Home Screen (iOS 16.4+).
    needsInstall: IS_IOS && !isStandalone(),
  };
}

export function permission() {
  if (IS_ARTIFACT || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

async function registration() {
  if (!support().serviceWorker) return null;
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
    return reg || null;
  } catch {
    return null;
  }
}

/** Ask for permission (must be called from a tap). Returns 'granted' | 'denied' | 'default' | 'unsupported'. */
export async function requestPermission() {
  if (permission() === 'unsupported') return 'unsupported';
  let p = Notification.permission;
  if (p === 'default') {
    try {
      p = await Notification.requestPermission();
    } catch {
      p = Notification.permission;
    }
  }
  if (p === 'granted') await registerBackground();
  notifyHooks.onEvent?.('notif_permission', { result: p });
  return p;
}

/** Periodic Background Sync lets the installed app check reminders while closed (Chrome/Edge). */
export async function registerBackground() {
  const reg = await registration();
  if (!reg || !('periodicSync' in reg)) return false;
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return false;
    await reg.periodicSync.register('studypath-reminders', { minInterval: 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

async function showSystem(entry) {
  if (permission() !== 'granted') return false;
  const opts = {
    body: entry.body,
    icon: ICON,
    badge: BADGE,
    tag: entry.key || entry.id,
    data: { url: entry.url || '#today', id: entry.id, type: entry.type },
  };
  const reg = await registration();
  if (reg) {
    try {
      await reg.showNotification(entry.title, opts);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const n = new Notification(entry.title, opts);
    n.onclick = () => {
      window.focus();
      if (entry.url) location.hash = entry.url;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

function lookingAtApp() {
  try {
    return document.visibilityState === 'visible' && document.hasFocus();
  } catch {
    return false;
  }
}

/**
 * Send a notification: always to the inbox; to the system when allowed.
 * item: { type, key?, title, body, url }. force = show even if notifications are off (test button).
 */
export async function notify(item, { force = false } = {}) {
  const s = store.state;
  if (item.key && s.inbox.some((n) => n.key === item.key)) return null;
  const entry = {
    id: uid(),
    key: item.key || null,
    type: item.type || 'info',
    title: item.title,
    body: item.body || '',
    url: item.url || '#today',
    at: Date.now(),
    read: false,
  };
  store.setLocal('inbox', [...s.inbox, entry]);
  const prefs = s.settings.notifications || {};
  const allowed = force || (prefs.enabled && prefs[entry.type] !== false && !inQuietHours(new Date(), s.settings));
  const visible = lookingAtApp();
  if (visible) notifyHooks.onInApp?.(entry);
  if (allowed && (!visible || force)) entry.system = await showSystem(entry);
  return entry;
}

export function testNotification() {
  return notify(
    { type: 'info', title: 'Notifications are on', body: 'This is how StudyPath reminders will look. You can choose which ones you get in Profile.', url: '#profile' },
    { force: true },
  );
}

// ---------- the reminder loop ----------
let loopTimer = null;
let running = false;

/** Merge notifications the service worker showed while the app was closed into the inbox. */
async function mergeFromWorker() {
  // notifications the student tapped (recorded by the service worker), for the research totals
  const opened = (await idbGet('swOpened')) || [];
  if (opened.length) {
    await idbSet('swOpened', []);
    for (const o of opened) notifyHooks.onEvent?.('reminder_opened', { type: o.type, by: 'system' });
  }
  const pending = (await idbGet('swInbox')) || [];
  if (!pending.length) return;
  await idbSet('swInbox', []);
  const s = store.state;
  const have = new Set(s.inbox.map((n) => n.key).filter(Boolean));
  const add = pending.filter((n) => !n.key || !have.has(n.key)).map((n) => ({ ...n, id: n.id || uid(), read: false }));
  if (add.length) store.setLocal('inbox', [...s.inbox, ...add]);
  for (const n of pending) notifyHooks.onEvent?.('reminder_shown', { type: n.type, by: 'worker' });
}

export async function checkReminders(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const s = store.state;
    if (!s.onboarded) return;
    await mergeFromWorker();
    const schedule = computeSchedule(s, now, 7);
    await idbSet('schedule', {
      items: schedule,
      prefs: { enabled: Boolean(s.settings.notifications?.enabled), quietStart: s.settings.quietStart, quietEnd: s.settings.quietEnd },
      savedAt: now.getTime(),
    });
    const fired = pruneFired((await idbGet('fired')) || {}, now.getTime());
    const timerOn = Boolean(s.timer);
    for (const it of dueItems(schedule, fired, now.getTime())) {
      fired[it.key] = now.getTime();
      if (timerOn && it.type === 'study') continue; // already studying
      await notify(it);
      notifyHooks.onEvent?.('reminder_shown', { type: it.type, by: 'app' });
    }
    await idbSet('fired', fired);
    notifyHooks.onSchedule?.(schedule);
  } catch (e) {
    console.warn('reminders', e);
  } finally {
    running = false;
  }
}

export function startReminderLoop() {
  if (loopTimer) return;
  checkReminders();
  loopTimer = setInterval(() => checkReminders(), LOOP_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminders();
  });
}

export function stopReminderLoop() {
  clearInterval(loopTimer);
  loopTimer = null;
}

/** Upcoming reminders (for the "what you'll get" list in Profile). */
export async function upcomingReminders(limit = 6) {
  const saved = await idbGet('schedule');
  const now = Date.now();
  return (saved?.items || []).filter((x) => x.at > now).slice(0, limit);
}
