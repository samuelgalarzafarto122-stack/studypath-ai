// The app's single source of truth.
// State lives in memory, is saved to IndexedDB on every change (debounced), and every synced
// record carries id / createdAt / updatedAt / deleted so the cloud sync can merge safely.

import { uid, nowISO, todayISO, debounce } from './util.js';
import { idbGet, idbSet, idbDel } from './idb.js';

export const SCHEMA_VERSION = 1;

/** Collections of records (arrays). Synced to the cloud when the student allows it. */
export const COLLECTIONS = ['classes', 'grades', 'tests', 'sessions', 'tutor', 'checkins', 'events'];
/** Single objects. Synced as one record each (id "me"). */
export const SINGLES = ['profile', 'consent', 'settings', 'program'];
/** Everything the cloud sees: collections + singles + plans (keyed by date). */
export const SYNCED = [...SINGLES, ...COLLECTIONS, 'plans'];

const AVATARS = ['blue', 'green', 'orange', 'violet', 'pink', 'teal'];

export function emptyState(today = todayISO()) {
  const t = nowISO();
  return {
    v: SCHEMA_VERSION,
    onboarded: false,
    demo: false,
    profile: {
      id: uid(), // pseudonymous research id: never linked to a real name
      nickname: '',
      gradeLevel: '10',
      goalAverage: 85,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      createdAt: t,
      updatedAt: t,
    },
    consent: {
      privacy: false, // read the privacy summary
      ageOk: false, // 13+ and (if under 18) guardian agrees
      cloud: false, // back up + sync in the cloud
      research: false, // include anonymized data in the research analysis
      tutorText: false, // include tutor chat text in research (off by default)
      teacherReport: false,
      parentAlerts: false,
      at: null,
      version: 1,
      updatedAt: t,
    },
    settings: {
      studyDays: [1, 2, 3, 4, 5], // 0 = Sunday
      studyTime: '17:00',
      sessionMinutes: 25,
      dailyMinutes: 50,
      notifications: {
        enabled: false,
        study: true,
        tests: true,
        grades: true,
        checkin: true,
        streak: true,
        program: true,
      },
      quietStart: '21:30',
      quietEnd: '07:00',
      theme: 'system',
      tutorEngine: 'auto', // auto = real AI when available, else built-in hints
      updatedAt: t,
    },
    program: { startDate: today, lessonsDone: {}, reflections: {}, updatedAt: t },
    classes: [],
    grades: [],
    tests: [],
    sessions: [], // completed study sessions (the log)
    tutor: [], // tutor conversations
    checkins: [],
    events: [], // small analytics events (reminder fired/opened, app opened)
    plans: {}, // date -> { sessions: [...], why, basis }
    // ----- device-local, never synced -----
    inbox: [], // in-app notifications
    timer: null, // running focus session
    sync: { dirty: {}, lastPull: null, lastPush: null, status: 'off', error: null, cloudUser: null },
  };
}

/** Fill in fields that older saved versions do not have. */
export function migrate(saved) {
  const base = emptyState(saved?.program?.startDate);
  const s = { ...base, ...saved };
  for (const k of SINGLES) s[k] = { ...base[k], ...(saved?.[k] || {}) };
  s.settings.notifications = { ...base.settings.notifications, ...(saved?.settings?.notifications || {}) };
  for (const k of COLLECTIONS) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.plans || typeof s.plans !== 'object') s.plans = {};
  if (!Array.isArray(s.inbox)) s.inbox = [];
  s.sync = { ...base.sync, ...(saved?.sync || {}) };
  if (!s.sync.dirty || typeof s.sync.dirty !== 'object') s.sync.dirty = {};
  s.v = SCHEMA_VERSION;
  return s;
}

const MAX_EVENTS = 600;
const MAX_INBOX = 150;

export class Store {
  constructor(key = 'state') {
    this.key = key;
    this.state = emptyState();
    this.listeners = new Set();
    this.saveSoon = debounce(() => this.saveNow(), 150);
  }

  async load() {
    const saved = await idbGet(this.key);
    if (saved && typeof saved === 'object' && saved.v) this.state = migrate(saved);
    return this.state;
  }

  async saveNow() {
    this.saveSoon.cancel?.();
    await idbSet(this.key, this.state);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(change = {}) {
    for (const fn of [...this.listeners]) {
      try {
        fn(change, this.state);
      } catch (e) {
        console.error(e);
      }
    }
  }

  commit(change) {
    this.saveSoon();
    this.emit(change);
  }

  markDirty(coll, id) {
    (this.state.sync.dirty[coll] ||= {})[id] = true;
  }

  // ----- collections -----
  list(coll) {
    return this.state[coll].filter((r) => !r.deleted);
  }

  get(coll, id) {
    return this.state[coll].find((r) => r.id === id);
  }

  add(coll, data, { silent = false } = {}) {
    const t = nowISO();
    const rec = { id: uid(), createdAt: t, ...data, updatedAt: t };
    this.state[coll].push(rec);
    if (coll === 'events' && this.state.events.length > MAX_EVENTS) {
      this.state.events.splice(0, this.state.events.length - MAX_EVENTS);
    }
    this.markDirty(coll, rec.id);
    if (!silent) this.commit({ coll, id: rec.id, op: 'add' });
    else this.saveSoon();
    return rec;
  }

  patch(coll, id, patch) {
    const rec = this.get(coll, id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: nowISO() });
    this.markDirty(coll, id);
    this.commit({ coll, id, op: 'patch' });
    return rec;
  }

  remove(coll, id) {
    return this.patch(coll, id, { deleted: true });
  }

  // ----- singles -----
  setSingle(key, patch) {
    Object.assign(this.state[key], patch, { updatedAt: nowISO() });
    this.markDirty(key, 'me');
    this.commit({ coll: key, op: 'patch' });
  }

  // ----- plans -----
  setPlan(date, plan) {
    this.state.plans[date] = { ...plan, id: date, date, updatedAt: nowISO() };
    this.markDirty('plans', date);
    this.commit({ coll: 'plans', id: date, op: 'set' });
    return this.state.plans[date];
  }

  // ----- device-local -----
  setLocal(key, value) {
    this.state[key] = value;
    if (key === 'inbox' && value.length > MAX_INBOX) value.splice(0, value.length - MAX_INBOX);
    this.commit({ coll: key, op: 'local' });
  }

  setTop(key, value) {
    this.state[key] = value;
    this.commit({ coll: key, op: 'top' });
  }

  // ----- cloud merge -----
  /**
   * Apply records that came from the cloud. Newer updatedAt wins; ties keep the local copy.
   * Returns how many records changed locally.
   */
  applyRemote(coll, records) {
    let changed = 0;
    const s = this.state;
    for (const rec of records) {
      if (!rec || !rec.id) continue;
      if (SINGLES.includes(coll)) {
        if (!s[coll].updatedAt || rec.updatedAt > s[coll].updatedAt) {
          s[coll] = { ...s[coll], ...rec };
          changed++;
        }
      } else if (coll === 'plans') {
        const cur = s.plans[rec.id];
        if (!cur || rec.updatedAt > cur.updatedAt) {
          s.plans[rec.id] = rec;
          changed++;
        }
      } else if (COLLECTIONS.includes(coll)) {
        const i = s[coll].findIndex((r) => r.id === rec.id);
        if (i === -1) {
          s[coll].push(rec);
          changed++;
        } else if (rec.updatedAt > s[coll][i].updatedAt) {
          s[coll][i] = rec;
          changed++;
        }
      }
    }
    if (changed) this.commit({ remote: true, coll });
    return changed;
  }

  /** Records waiting to be uploaded, grouped by collection. */
  dirtyRecords() {
    const out = {};
    const s = this.state;
    for (const [coll, ids] of Object.entries(s.sync.dirty)) {
      const recs = [];
      for (const id of Object.keys(ids)) {
        if (SINGLES.includes(coll)) recs.push({ ...s[coll], id: 'me' });
        else if (coll === 'plans') s.plans[id] && recs.push(s.plans[id]);
        else {
          const r = s[coll]?.find((x) => x.id === id);
          if (r) recs.push(r);
        }
      }
      if (recs.length) out[coll] = recs;
    }
    return out;
  }

  /** Every synced record (used for the first upload after the student turns cloud on). */
  allSyncedRecords() {
    const s = this.state;
    const out = {};
    for (const k of SINGLES) out[k] = [{ ...s[k], id: 'me' }];
    for (const k of COLLECTIONS) out[k] = s[k].slice();
    out.plans = Object.values(s.plans);
    return out;
  }

  clearDirty(sent) {
    const d = this.state.sync.dirty;
    for (const [coll, recs] of Object.entries(sent)) {
      for (const r of recs) {
        // Only clear if it did not change again while the upload was in flight.
        const cur = SINGLES.includes(coll)
          ? this.state[coll]
          : coll === 'plans'
            ? this.state.plans[r.id]
            : this.state[coll]?.find((x) => x.id === r.id);
        if (cur && cur.updatedAt === r.updatedAt && d[coll]) delete d[coll][r.id];
      }
      if (d[coll] && !Object.keys(d[coll]).length) delete d[coll];
    }
    this.saveSoon();
  }

  markAllDirty() {
    const s = this.state;
    for (const k of SINGLES) this.markDirty(k, 'me');
    for (const k of COLLECTIONS) for (const r of s[k]) this.markDirty(k, r.id);
    for (const id of Object.keys(s.plans)) this.markDirty('plans', id);
    this.saveSoon();
  }

  replaceAll(next) {
    this.state = migrate(next);
    this.saveNow();
    this.emit({ replace: true });
  }

  async wipe() {
    this.state = emptyState();
    await idbDel(this.key);
    await idbDel('schedule');
    await idbDel('fired');
    this.emit({ replace: true, wiped: true });
  }
}

export const store = new Store();
