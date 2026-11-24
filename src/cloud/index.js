// Cloud backup, sync and research totals. Off until the student turns it on.
// Two back ends share this sync engine:
//   - Supabase (the installable app): set supabaseUrl + supabaseAnonKey in config.js
//   - claude.ai (the online demo): the artifact's private per-user database
// Every record carries updatedAt; the newest copy wins, so offline edits merge safely.

import { IS_ARTIFACT } from '../env.js';
import { store, SYNCED } from '../state.js';
import { researchSummary } from '../logic/research.js';
import { hooks as actionHooks } from '../actions.js';
import { resetProvider } from '../tutor/ai.js';

const PUSH_DELAY = 2500;
const PULL_EVERY = 60 * 1000;
const RESEARCH_EVERY = 10 * 60 * 1000;

let adapter = null;
let ui = { toast: () => {}, render: () => {} };
let st = { state: 'not-configured', lastSync: null, error: null, userId: null };
let pushTimer = null;
let pullTimer = null;
let backoff = 0;
let pushing = false;
let pushAgain = false;
let started = false;
let researchSentAt = 0;
let researchState = null; // 'on' | 'off'
const listeners = new Set();

function set(patch) {
  st = { ...st, ...patch };
  for (const fn of listeners) fn(st);
  ui.render();
}

const isOffline = (e) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || e?.name === 'TypeError' || /fetch|network|Failed to fetch|Load failed/i.test(String(e?.message || ''));

function friendly(e) {
  const msg = String(e?.message || e || '');
  if (e?.code === 'no_user') return msg;
  if (e?.code === 'invalid_argument' && IS_ARTIFACT) return 'This shared link does not allow saving data, so your data stays on this device.';
  if (/anonymous sign-ins are disabled/i.test(msg)) return 'The cloud database needs "Anonymous sign-ins" turned on (Supabase → Authentication → Sign In / Providers).';
  if (/relation .* does not exist|function .* does not exist|Could not find the function|schema cache/i.test(msg)) return 'The cloud database is not set up yet: run supabase/setup.sql in the Supabase SQL editor.';
  if (/JWT|apikey|Invalid API key/i.test(msg)) return 'The cloud key in config.js is not valid. Use the project URL and the anon/publishable key.';
  if (e?.code === 'quota_exceeded') return 'The cloud storage for this page is full.';
  return msg || 'Unknown error';
}

function handleError(e) {
  console.warn('[cloud]', e);
  if (e?.code === 'no_user' || e?.code === 'read_only') {
    // not a hiccup: trying again won't help until the student signs in or gets access
    set({ state: 'unavailable', error: e.message });
    return;
  }
  if (isOffline(e)) {
    set({ state: 'offline', error: null });
  } else {
    set({ state: 'error', error: friendly(e) });
  }
  backoff = Math.min(5 * 60 * 1000, backoff ? backoff * 2 : 15000);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(), backoff);
}

function rowsFrom(dirty) {
  const rows = [];
  for (const [coll, recs] of Object.entries(dirty)) {
    for (const r of recs) rows.push({ coll, id: String(r.id), data: r, updatedAt: r.updatedAt || new Date().toISOString(), deleted: Boolean(r.deleted) });
  }
  return rows;
}

async function pull() {
  const s = store.state;
  const res = await adapter.pull(s.sync.lastPull);
  const byColl = {};
  for (const r of res.rows) {
    if (!SYNCED.includes(r.coll) || !r.data) continue;
    (byColl[r.coll] ||= []).push({ ...r.data, id: r.data.id ?? r.id });
  }
  for (const [coll, recs] of Object.entries(byColl)) store.applyRemote(coll, recs);
  if (res.cursor) s.sync.lastPull = res.cursor;
  s.sync.lastSyncAt = Date.now();
  store.saveSoon();
}

async function pushResearch(force = false) {
  if (!adapter?.putResearch) return;
  const s = store.state;
  const share = s.consent.cloud && s.consent.research && !s.demo;
  if (share) {
    if (!force && researchState === 'on' && Date.now() - researchSentAt < RESEARCH_EVERY) return;
    await adapter.putResearch(researchSummary(s));
    researchState = 'on';
    researchSentAt = Date.now();
  } else if (researchState !== 'off') {
    await adapter.putResearch(null);
    researchState = 'off';
  }
}

async function push({ forceResearch = false } = {}) {
  if (pushing) {
    pushAgain = true;
    return;
  }
  pushing = true;
  try {
    const dirty = store.dirtyRecords();
    const rows = rowsFrom(dirty);
    if (rows.length) {
      set({ state: 'syncing' });
      await adapter.push(rows, store.state);
      store.clearDirty(dirty);
      store.state.sync.lastPush = Date.now();
    }
    await pushResearch(forceResearch);
  } finally {
    pushing = false;
    if (pushAgain) {
      pushAgain = false;
      schedulePush(500);
    }
  }
}

function schedulePush(delay = PUSH_DELAY) {
  if (!started) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await push();
      backoff = 0;
      set({ state: 'synced', lastSync: Date.now(), error: null });
    } catch (e) {
      handleError(e);
    }
  }, delay);
}

function startTimers() {
  clearInterval(pullTimer);
  pullTimer = setInterval(() => {
    if (document.visibilityState === 'visible') syncNow({ quiet: true });
  }, PULL_EVERY);
}

async function start() {
  if (!adapter) {
    set({ state: 'not-configured' });
    return false;
  }
  if (store.state.demo) {
    set({ state: 'demo' });
    return false;
  }
  set({ state: 'connecting', error: null });
  try {
    const userId = await adapter.connect();
    const s = store.state;
    if (s.sync.cloudUser !== userId) {
      // First sync of this device with this cloud account: send everything.
      s.sync.cloudUser = userId;
      s.sync.lastPull = null;
      store.markAllDirty();
    }
    started = true;
    await pull();
    await push({ forceResearch: true });
    backoff = 0;
    set({ state: 'synced', lastSync: Date.now(), error: null, userId });
    startTimers();
    return true;
  } catch (e) {
    started = false;
    handleError(e);
    return false;
  }
}

export async function syncNow({ quiet = false } = {}) {
  if (!adapter || !store.state.consent.cloud) return false;
  if (store.state.demo) {
    set({ state: 'demo' });
    return false;
  }
  if (!started) return start();
  try {
    if (!quiet) set({ state: 'syncing' });
    await pull();
    await push({ forceResearch: !quiet });
    backoff = 0;
    set({ state: 'synced', lastSync: Date.now(), error: null });
    return true;
  } catch (e) {
    handleError(e);
    return false;
  }
}

export const cloud = {
  label: '',
  status: () => ({ ...st }),
  configured: () => Boolean(adapter),
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async enable() {
    if (!adapter) {
      set({ state: 'not-configured' });
      return false;
    }
    return start();
  },
  async disable({ deleteRemote = false } = {}) {
    started = false;
    clearTimeout(pushTimer);
    clearInterval(pullTimer);
    if (deleteRemote && adapter) {
      try {
        if (!st.userId) await adapter.connect();
        await adapter.deleteAll();
        store.state.sync.cloudUser = null;
        store.state.sync.lastPull = null;
      } catch (e) {
        ui.toast(`Could not delete the cloud copy: ${friendly(e)}`, { iconName: 'alert' });
      }
    }
    researchState = null;
    set({ state: adapter ? 'off' : 'not-configured', error: null });
  },
  syncNow: () => syncNow(),
  async research() {
    if (!adapter?.research) return null;
    if (!st.userId) {
      try {
        await adapter.connect();
      } catch (e) {
        // reading the totals doesn't need write access; the adapter decides who may see them
        if (e?.code !== 'read_only') throw e;
      }
    }
    return adapter.research();
  },
  researchHelp() {
    if (!adapter) return 'Real data needs the cloud database. Until it is connected, use the simulated class.';
    return adapter.researchHelp || 'The research totals are not available here.';
  },
  saveFile: null,
};

export async function initCloud({ toast, render } = {}) {
  ui = { toast: toast || ui.toast, render: render || ui.render };
  try {
    if (IS_ARTIFACT) {
      const { createArtifactAdapter } = await import('./artifact.js');
      adapter = await createArtifactAdapter();
    } else {
      const cfg = globalThis.STUDYPATH_CONFIG || {};
      if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
        const { createSupabaseAdapter } = await import('./supabase.js');
        adapter = await createSupabaseAdapter(cfg);
      }
    }
  } catch (e) {
    console.warn('[cloud] init failed', e);
    adapter = null;
  }
  cloud.label = adapter?.label || '';
  cloud.saveFile = adapter?.saveFile || null;
  if (adapter?.tutorProvider) {
    actionHooks.cloudTutor = () => adapter.tutorProvider();
    resetProvider();
  }
  actionHooks.beforeWipe = async () => {
    if (adapter && store.state.consent.cloud) {
      if (!st.userId) await adapter.connect();
      await adapter.deleteAll();
    }
    await cloud.disable();
  };

  store.subscribe((change) => {
    if (change.remote || change.coll === 'events' || change.op === 'local' || change.op === 'top') return;
    if (change.replace) {
      // demo entered/left or data imported
      if (store.state.demo) {
        started = false;
        set({ state: adapter ? 'demo' : 'not-configured' });
      } else if (store.state.consent.cloud && adapter && !started) start();
      return;
    }
    if (started && store.state.consent.cloud) schedulePush();
  });
  // events are silent (no emit), so push them along with the next change or every few minutes
  setInterval(() => {
    if (started && store.state.consent.cloud && Object.keys(store.state.sync.dirty).length) schedulePush(100);
  }, 3 * 60 * 1000);
  window.addEventListener('online', () => store.state.consent.cloud && syncNow({ quiet: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && started) syncNow({ quiet: true });
    if (document.visibilityState === 'hidden' && started && Object.keys(store.state.sync.dirty).length) push().catch(() => {});
  });

  if (!adapter) set({ state: 'not-configured' });
  else if (store.state.demo) set({ state: 'demo' });
  else if (store.state.consent.cloud && store.state.onboarded) await start();
  else set({ state: 'off' });
}
