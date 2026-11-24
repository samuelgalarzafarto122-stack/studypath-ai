// Supabase back end for the installable app.
// - Anonymous sign-in: every student gets a random user id, no email or password.
// - Row Level Security (supabase/setup.sql): a student can only read and write their own rows.
// - Research: one anonymous summary per opted-in student; the dashboard calls a database
//   function that returns totals only, hiding groups smaller than 5.

const CHUNK = 200;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (globalThis.supabase?.createClient) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load the cloud library.'));
    document.head.appendChild(el);
  });
}

export async function createSupabaseAdapter(cfg) {
  await loadScript(cfg.supabaseScript || 'vendor/supabase.js');
  const client = globalThis.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'studypath-auth', detectSessionInUrl: false },
  });
  let userId = null;

  const check = ({ data, error }) => {
    if (error) throw Object.assign(new Error(error.message || String(error)), { code: error.code, status: error.status });
    return data;
  };

  return {
    name: 'supabase',
    label: 'Supabase (the project’s private cloud database)',
    client,

    async connect() {
      let session = check(await client.auth.getSession())?.session;
      if (!session) session = check(await client.auth.signInAnonymously())?.session;
      if (!session?.user?.id) throw new Error('Could not sign in to the cloud.');
      userId = session.user.id;
      return userId;
    },

    async push(rows) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map((r) => ({ coll: r.coll, id: r.id, data: r.data, updated_at: r.updatedAt, deleted: r.deleted }));
        check(await client.rpc('sync_push', { rows: chunk }));
      }
    },

    /** Rows changed on the server since `since` (server time), oldest first. */
    async pull(since) {
      const rows = [];
      let cursor = since || null;
      for (let page = 0; page < 50; page++) {
        let q = client.from('records').select('coll,id,data,updated_at,deleted,server_updated_at').order('server_updated_at', { ascending: true }).limit(1000);
        // re-read the last few seconds too: a write that committed late is never skipped
        // (records are merged by their own updatedAt, so reading one twice is harmless)
        if (cursor) q = q.gt('server_updated_at', page === 0 ? new Date(Date.parse(cursor) - 10000).toISOString() : cursor);
        const data = check(await q);
        for (const r of data) rows.push({ coll: r.coll, id: r.id, data: r.data, updatedAt: r.updated_at, deleted: r.deleted });
        if (data.length) cursor = data[data.length - 1].server_updated_at;
        if (data.length < 1000) break;
      }
      return { rows, cursor };
    },

    async deleteAll() {
      if (!userId) await this.connect();
      check(await client.from('records').delete().eq('user_id', userId));
      check(await client.from('research_summaries').delete().eq('user_id', userId));
      await client.from('push_subscriptions').delete().eq('user_id', userId);
      await client.from('reminders').delete().eq('user_id', userId);
    },

    async putResearch(summary) {
      if (!userId) await this.connect();
      if (summary) check(await client.from('research_summaries').upsert({ user_id: userId, data: summary, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
      else check(await client.from('research_summaries').delete().eq('user_id', userId));
    },

    async research() {
      return check(await client.rpc('research_dashboard'));
    },
    researchHelp: 'Real data comes from students who opted in.',

    // Web Push (next step, not turned on yet): the tables exist in setup.sql, and these two calls are
    // ready for when a small server function sends reminders while the app is closed.
    /** Save this device's push subscription so the server can send reminders. */
    async savePushSubscription(sub, schedule) {
      if (!userId) await this.connect();
      const json = sub.toJSON();
      check(
        await client.from('push_subscriptions').upsert(
          { user_id: userId, endpoint: json.endpoint, keys: json.keys, updated_at: new Date().toISOString() },
          { onConflict: 'endpoint' },
        ),
      );
      if (schedule) await this.saveReminderSchedule(schedule);
    },

    /** The next 7 days of reminders, so the server can push them when the app is closed. */
    async saveReminderSchedule(items) {
      if (!userId) await this.connect();
      const rows = items.slice(0, 60).map((it) => ({ user_id: userId, key: it.key, at: new Date(it.at).toISOString(), title: it.title, body: it.body, url: it.url, type: it.type }));
      check(await client.rpc('replace_reminders', { items: rows }));
    },
  };
}
