/* StudyPath service worker.
   - Offline: caches the app so it opens without internet.
   - Notifications: opens the right screen when a notification is tapped.
   - Background reminders: Periodic Background Sync (installed app on Chrome/Edge) reads the
     reminder schedule the app saved in IndexedDB and shows what is due.
   - Web Push (optional server): shows reminders sent while the app is closed. */

const VERSION = 'studypath-v1-dev';
const PRECACHE = ['./', './index.html', './assets/styles.css', './config.js', './manifest.webmanifest', './assets/icons/icon-192.png', './assets/icons/badge-96.png'];
const ICON = 'assets/icons/icon-192.png';
const BADGE = 'assets/icons/badge-96.png';
const GRACE_MS = 6 * 3600 * 1000;

// ---------- install / update ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cloud requests always go to the network
  if (req.mode === 'navigate') return event.respondWith(networkFirst(req, './index.html'));
  if (url.pathname.endsWith('/config.js') || url.pathname.endsWith('/sw.js')) return event.respondWith(networkFirst(req));
  event.respondWith(staleWhileRevalidate(req));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'check-reminders') event.waitUntil(checkReminders());
});

// ---------- IndexedDB (same database as the app: "studypath" / "kv") ----------
function openDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('studypath', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function idbGet(key) {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(undefined);
  });
}
async function idbSet(key, value) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function inQuiet(date, prefs) {
  if (!prefs) return false;
  const m = date.getHours() * 60 + date.getMinutes();
  const qs = minutesOf(prefs.quietStart);
  const qe = minutesOf(prefs.quietEnd);
  if (qs === qe) return false;
  return qs > qe ? m >= qs || m < qe : m >= qs && m < qe;
}

async function remember(entries) {
  if (!entries.length) return;
  const inbox = (await idbGet('swInbox')) || [];
  await idbSet('swInbox', [...inbox, ...entries].slice(-50));
}

// ---------- background reminders ----------
async function checkReminders() {
  const saved = await idbGet('schedule');
  if (!saved?.items?.length) return;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.some((w) => w.focused)) return; // the open app handles it
  const fired = (await idbGet('fired')) || {};
  const now = Date.now();
  const due = saved.items.filter((it) => it.at <= now && it.at > now - GRACE_MS && !fired[it.key]);
  if (!due.length) return;
  const shown = [];
  for (const it of due) {
    fired[it.key] = now;
    shown.push({ key: it.key, type: it.type, title: it.title, body: it.body, url: it.url, at: now });
    if (!saved.prefs?.enabled || inQuiet(new Date(now), saved.prefs)) continue;
    await self.registration.showNotification(it.title, { body: it.body, icon: ICON, badge: BADGE, tag: it.key, data: { url: it.url || '#today', type: it.type } });
  }
  await idbSet('fired', fired);
  await remember(shown);
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'studypath-reminders') event.waitUntil(checkReminders());
});

// ---------- Web Push (optional server) ----------
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'StudyPath', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const title = d.title || 'StudyPath';
      await self.registration.showNotification(title, { body: d.body || '', icon: ICON, badge: BADGE, tag: d.key || undefined, data: { url: d.url || '#today', type: d.type } });
      if (d.key) {
        const fired = (await idbGet('fired')) || {};
        fired[d.key] = Date.now();
        await idbSet('fired', fired);
      }
      await remember([{ key: d.key || null, type: d.type || 'info', title, body: d.body || '', url: d.url || '#today', at: Date.now() }]);
    })(),
  );
});

// ---------- tapping a notification ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '#today';
  event.waitUntil(
    (async () => {
      const opened = (await idbGet('swOpened')) || [];
      opened.push({ type: event.notification.data?.type || 'info', at: Date.now() });
      await idbSet('swOpened', opened.slice(-100));
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'navigate', url });
          return;
        }
      }
      await self.clients.openWindow(`./${url}`);
    })(),
  );
});
