// claude.ai back end for the online demo (the artifact version).
// Each viewer's data lives in their private subtree data/users/<id>/ (nobody else can read it,
// not even the page owner). Research: each opted-in viewer writes one anonymous summary to
// research/<id>; only the page owner/editors can read those, and only as totals.

import { SINGLES } from '../state.js';
import { aggregateResearch } from '../logic/research.js';

const MAX_EVENTS = 300;
const MAX_PLANS = 60;

function mergeById(remote = [], local = []) {
  const map = new Map();
  for (const r of remote) if (r && r.id) map.set(r.id, r);
  for (const r of local) {
    if (!r || !r.id) continue;
    const cur = map.get(r.id);
    if (!cur || String(r.updatedAt || '') >= String(cur.updatedAt || '')) map.set(r.id, r);
  }
  return [...map.values()];
}

const docId = (s) => String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 180);

export async function createArtifactAdapter() {
  const use = globalThis.claude?.use;
  if (typeof use !== 'function') return null;
  const [db, user, downloads] = await Promise.all([use('db'), use('user'), use('downloads')]);
  if (!db) return null;
  let uid = null;
  const mine = () => db.collection(`data/users/${uid}`);
  const queue = [];
  let busy = false;

  // one write at a time
  function write(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      if (!busy) drain();
    });
  }
  async function drain() {
    busy = true;
    while (queue.length) {
      const job = queue.shift();
      try {
        job.resolve(await job.fn());
      } catch (e) {
        job.reject(e);
      }
    }
    busy = false;
  }

  return {
    name: 'artifact',
    label: 'claude.ai (private to your account)',

    async connect() {
      uid = user ? await user.id() : null;
      if (!uid) throw Object.assign(new Error('Sign in to claude.ai to back up your data. Until then it stays on this device.'), { code: 'no_user' });
      // Anyone with the link can use the app, but claude.ai only lets Contributors (and up) save data.
      const canWrite = typeof user.can === 'function' ? await user.can('data.write') : null;
      if (canWrite === false) {
        throw Object.assign(
          new Error('This link lets you use the app but not back it up online, so your data stays on this device. To back up, ask the person who shared it for Contributor access.'),
          { code: 'read_only' },
        );
      }
      return uid;
    },

    async push(rows, state) {
      const colls = new Set(rows.map((r) => r.coll));
      const now = new Date().toISOString();
      for (const coll of colls) {
        if (coll === 'tutor') {
          for (const r of rows.filter((x) => x.coll === 'tutor')) {
            await write(() => mine().doc(`tutor--${docId(r.id)}`).set({ coll: 'tutor', record: r.data, updatedAt: r.updatedAt }));
          }
        } else if (SINGLES.includes(coll)) {
          await write(() => mine().doc(`single--${coll}`).set({ coll, record: { ...state[coll], id: 'me' }, updatedAt: state[coll].updatedAt || now }));
        } else {
          const ref = mine().doc(coll);
          let local = coll === 'plans' ? Object.values(state.plans) : state[coll].slice();
          if (coll === 'events') local = local.slice(-MAX_EVENTS);
          if (coll === 'plans') local = local.sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(-MAX_PLANS);
          await write(async () => {
            const cur = await ref.get();
            const merged = mergeById(cur.exists ? cur.data().records : [], local);
            await ref.set({ coll, records: merged, updatedAt: now });
          });
        }
      }
    },

    async pull() {
      const snap = await mine().get();
      const rows = [];
      for (const d of snap.docs) {
        const body = d.data() || {};
        if (body.record) rows.push({ coll: body.coll, id: body.record.id, data: body.record });
        else if (Array.isArray(body.records)) for (const r of body.records) rows.push({ coll: body.coll, id: r.id, data: r });
      }
      return { rows, cursor: null };
    },

    async deleteAll() {
      const snap = await mine().get();
      for (const d of snap.docs) await write(() => mine().doc(d.id).delete());
      await write(() => db.doc(`research/${uid}`).delete());
    },

    async putResearch(summary) {
      const ref = db.doc(`research/${uid}`);
      if (summary) await write(() => ref.set({ summary, updatedAt: new Date().toISOString() }));
      else await write(() => ref.delete());
    },

    async research() {
      const allowed = user ? (await user.isOwner()) || (await user.canEdit()) : false;
      if (!allowed) return null;
      const snap = await db.collection('research').get();
      return aggregateResearch(snap.docs.map((d) => d.data()?.summary).filter(Boolean));
    },
    researchHelp: 'Only the owner of this page can see the research totals (anonymous, from viewers who opted in).',

    async saveFile(filename, text) {
      if (!downloads) return false;
      try {
        await downloads.save({ filename, data: text });
        return true;
      } catch {
        return false;
      }
    },
  };
}
