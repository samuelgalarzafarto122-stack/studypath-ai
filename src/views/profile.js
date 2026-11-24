// Profile & settings: about you, study schedule, notifications, AI tutor, cloud & privacy,
// install, appearance, demo. Plus the notification inbox.

import { html, fmtAgo, fmtTime, fmtDate, todayISO } from '../util.js';
import { NOTIF_TYPES } from '../logic/reminders.js';
import { MIN_GROUP } from '../logic/research.js';
import { IS_ARTIFACT } from '../env.js';
import { support, permission, requestPermission, testNotification, upcomingReminders, checkReminders } from '../notify.js';
import { installSteps, installState, promptInstall } from '../install.js';
import { cloud } from '../cloud/index.js';
import { icon } from '../ui/icons.js';
import { emptyState } from '../ui/parts.js';
import { confirmSheet, openSheet, toast } from '../ui/dom.js';
import * as A from '../actions.js';
import { store } from '../state.js';
import { importInput, pickImport, importFromInput } from '../ui/importer.js';

const DAYS = [
  [1, 'M', 'Monday'],
  [2, 'T', 'Tuesday'],
  [3, 'W', 'Wednesday'],
  [4, 'T', 'Thursday'],
  [5, 'F', 'Friday'],
  [6, 'S', 'Saturday'],
  [0, 'S', 'Sunday'],
];
const AVATARS = ['blue', 'green', 'orange', 'violet', 'pink', 'teal'];

let upcoming = [];

function sw(name, checked, { disabled = false, id } = {}) {
  return html`<span class="switch"><input type="checkbox" role="switch" name="${name}" id="${id || `sw-${name}`}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} data-change="${name}"><i></i></span>`;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  if (IS_ARTIFACT && cloud.saveFile) return cloud.saveFile(filename, text, type);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return Promise.resolve(true);
}

function notifSection(s) {
  const sup = support();
  const perm = permission();
  const on = s.settings.notifications;
  let notice = '';
  if (IS_ARTIFACT)
    notice = html`<div class="notice">${icon('info')}<span>In this online demo, notifications show up in the app (bell icon). Phone and computer notifications work in the installed app.</span></div>`;
  else if (sup.needsInstall)
    notice = html`<div class="notice warn">${icon('phone')}<span><b>iPhone/iPad:</b> notifications only work after you add StudyPath to your Home Screen (Share → Add to Home Screen) and open it from there. iOS 16.4 or newer.</span></div>`;
  else if (perm === 'denied')
    notice = html`<div class="notice bad">${icon('alert')}<span>Notifications are blocked for this site. Allow them in your browser's site settings (the lock icon next to the address), then come back.</span></div>`;
  else if (perm === 'unsupported')
    notice = html`<div class="notice">${icon('info')}<span>This browser can't show system notifications. You'll still see every reminder in the app.</span></div>`;
  const systemOn = on.enabled && perm === 'granted';
  return html`<section class="card" id="notifications" aria-labelledby="n-h">
    <div class="card-head"><h2 id="n-h">Notifications</h2>${systemOn ? html`<span class="pill good">${icon('check')}On</span>` : html`<span class="pill">In-app only</span>`}</div>
    <div class="stack">
      ${notice}
      <div class="switch-row">
        <div class="txt"><b>Phone & computer notifications</b><small>Reminders appear even when StudyPath isn't on screen.</small></div>
        ${sw('notif-master', systemOn, { disabled: IS_ARTIFACT || perm === 'unsupported' || perm === 'denied' || sup.needsInstall })}
      </div>
      <div>
        ${Object.entries(NOTIF_TYPES).map(
          ([k, v]) => html`<div class="switch-row"><div class="txt"><b>${v.label}</b><small>${v.desc}</small></div>${sw(`notif-${k}`, on[k] !== false, { id: `nt-${k}` })}</div>`,
        )}
      </div>
      <form class="form-grid two" data-form="quiet">
        <label class="field"><span>Quiet hours start</span><input class="input" type="time" name="quietStart" id="q-start" value="${s.settings.quietStart}"></label>
        <label class="field"><span>Quiet hours end</span><input class="input" type="time" name="quietEnd" id="q-end" value="${s.settings.quietEnd}"></label>
        <div class="btn-row"><button class="btn small secondary" type="submit">Save quiet hours</button></div>
      </form>
      ${upcoming.length
        ? html`<div><div class="label">Coming up</div><div class="list">${upcoming.map(
            (r) => html`<div class="list-item"><span class="pill">${NOTIF_TYPES[r.type]?.label || r.type}</span><div class="li-main"><div class="li-title">${r.title}</div><div class="li-sub">${fmtDate(new Date(r.at).toISOString().slice(0, 10) === todayISO() ? todayISO() : localISO(r.at), { weekday: 'short', month: 'short', day: 'numeric' })}, ${new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div></div></div>`,
          )}</div></div>`
        : ''}
      <div class="btn-row">
        <button class="btn small secondary" type="button" data-action="test-notif" ${IS_ARTIFACT ? 'disabled' : ''}>${icon('bell')}Send a test notification</button>
      </div>
      <p class="hint">Reminders are worked out on your device from your plan and tests. ${sup.periodicSync ? 'Installed on Chrome or Edge, StudyPath can also check for reminders in the background.' : ''}</p>
    </div>
  </section>`;
}

function localISO(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cloudSection(s) {
  const st = cloud.status();
  const c = s.consent;
  const stateText = {
    'not-configured': html`<span class="pill">${icon('cloud_off')}Not set up yet</span>`,
    off: html`<span class="pill">${icon('cloud_off')}Off</span>`,
    connecting: html`<span class="pill accent"><span class="spinner" style="width:12px;height:12px;border-width:2px"></span>Connecting</span>`,
    syncing: html`<span class="pill accent"><span class="spinner" style="width:12px;height:12px;border-width:2px"></span>Syncing</span>`,
    synced: html`<span class="pill good">${icon('cloud')}Backed up</span>`,
    offline: html`<span class="pill warn">${icon('cloud_off')}Offline, will sync later</span>`,
    error: html`<span class="pill bad">${icon('alert')}Problem</span>`,
    unavailable: html`<span class="pill">${icon('cloud_off')}On this device only</span>`,
    demo: html`<span class="pill">${icon('info')}Paused for sample data</span>`,
  }[st.state] || '';
  return html`<section class="card" id="privacy" aria-labelledby="c-h">
    <div class="card-head"><h2 id="c-h">Cloud & privacy</h2>${stateText}</div>
    <div class="stack">
      <div class="privacy-box">
        <b>What StudyPath keeps</b>
        <ul>
          <li>Your nickname (never your real name), grade level, classes, grades, tests, study sessions, tutor chats and check-ins. All of it is saved on this device.</li>
          <li>${IS_ARTIFACT
            ? 'With cloud backup on, a copy is kept in your private space on claude.ai. Nobody else can open it, not even the person who shared this page.'
            : 'With cloud backup on, a copy is saved online under a random ID, not your email or real name. Other students can\'t see it; the person who runs this copy of StudyPath manages that database.'}</li>
          <li>Teachers and parents see nothing unless you share a summary yourself.</li>
          <li>Research only gets a summary of numbers (no names, no notes, no chat text), and only if you opt in. The dashboard shows totals for groups of ${MIN_GROUP} or more students, never one student.</li>
        </ul>
      </div>
      ${st.state === 'not-configured'
        ? html`<div class="notice">${icon('info')}<span>Cloud backup isn't connected in this copy of the app yet. Everything is saved on this device. (Setup steps are in the guide.)</span></div>`
        : ''}
      ${st.state === 'unavailable' ? html`<div class="notice">${icon('info')}<span>${st.error}</span></div>` : ''}
      ${st.state === 'error' ? html`<div class="notice bad">${icon('alert')}<span>${st.error || 'Could not reach the cloud.'} Your data is safe on this device.</span></div>` : ''}
      <div>
        <div class="switch-row"><div class="txt"><b>Back up & sync to the cloud</b><small>${IS_ARTIFACT
          ? 'Keeps a copy in your private space on claude.ai, so you can open your data on any device where you are signed in.'
          : `${cloud.label ? `Stored with ${cloud.label}, ` : 'Saved online '}under a random ID. The copy belongs to this device: to switch devices, use “Download my data” here and “Bring your data from a file” on the new one.`}</small></div>${sw('consent-cloud', c.cloud, { disabled: st.state === 'not-configured' })}</div>
        <div class="switch-row"><div class="txt"><b>Help the research project</b><small>Shares a summary of numbers (weekly average, study time, plan and tutor use, check-in scores), with no names or text, for the class research dashboard.</small></div>${sw('consent-research', c.research, { disabled: !c.cloud || st.state === 'not-configured' })}</div>
      </div>
      ${st.lastSync ? html`<p class="hint">Last synced ${fmtAgo(st.lastSync)}.${st.userId ? ` Your anonymous ID: ${String(st.userId).slice(0, 8)}…` : ''}</p>` : ''}
      <div class="btn-row">
        ${c.cloud && st.state !== 'not-configured' ? html`<button class="btn small secondary" type="button" data-action="sync-now">${icon('refresh')}Sync now</button>` : ''}
        <button class="btn small secondary" type="button" data-action="export-json">${icon('download')}Download my data</button>
        <button class="btn small secondary" type="button" data-action="export-csv">${icon('download')}Grades & study log (CSV)</button>
        <button class="btn small secondary" type="button" data-action="pick-import">${icon('upload')}Bring data from a file</button>${importInput()}
      </div>
      <p class="hint">New phone or computer? Download your data here, then choose “Bring your data from a file” on the welcome screen of the new one.</p>
      <div class="switch-row" style="border:0"><div class="txt"><b>Delete everything</b><small>Erases your data from this device${c.cloud ? ' and the cloud' : ''}. This can't be undone.</small></div>
        <button class="btn small danger-ghost" type="button" data-action="delete-all">${icon('trash')}Delete</button></div>
    </div>
  </section>`;
}

const profile = {
  title: 'Profile & settings',
  render(s) {
    const set = s.settings;
    const inst = installState();
    return html`
      <div class="page-head"><div><h1>Profile & settings</h1><p>Everything here is yours to change.</p></div></div>
      <div class="masonry">
        <section class="card" aria-labelledby="p-h">
          <div class="card-head"><h2 id="p-h">About you</h2></div>
          <form class="stack" data-form="profile">
            <div class="form-grid two">
              <label class="field"><span>Nickname</span><input class="input" name="nickname" id="pf-nick" maxlength="24" value="${s.profile.nickname}" autocomplete="off"></label>
              <label class="field"><span>Grade</span><select class="input" name="gradeLevel" id="pf-grade">${['9', '10', '11', '12'].map((g) => html`<option value="${g}" ${s.profile.gradeLevel === g ? 'selected' : ''}>${g}th grade</option>`)}</select></label>
            </div>
            <label class="field"><span>Goal for your overall average</span><input class="input" name="goalAverage" id="pf-goal" inputmode="numeric" value="${s.profile.goalAverage}"></label>
            <div class="field"><span>Color</span><div class="row wrap">${AVATARS.map(
              (a) => html`<label class="avatar av-${a}" style="cursor:pointer;position:relative"><input type="radio" name="avatar" value="${a}" ${s.profile.avatar === a ? 'checked' : ''} class="sr-only" id="av-${a}"><span aria-hidden="true">${s.profile.avatar === a ? icon('check', { size: 18 }) : ''}</span><span class="sr-only">${a}</span></label>`,
            )}</div></div>
            <div class="btn-row"><button class="btn small" type="submit">Save</button></div>
          </form>
        </section>

        <section class="card" aria-labelledby="sch-h">
          <div class="card-head"><h2 id="sch-h">Study schedule</h2></div>
          <form class="stack" data-form="schedule">
            <div class="field"><span>Study days</span><div class="days">${DAYS.map(
              ([v, l, full]) => html`<label><input type="checkbox" name="studyDays" value="${v}" ${set.studyDays.includes(v) ? 'checked' : ''} aria-label="${full}" id="day-${v}"><span aria-hidden="true">${l}</span></label>`,
            )}</div></div>
            <div class="form-grid three">
              <label class="field"><span>Start time</span><input class="input" type="time" name="studyTime" id="sc-time" value="${set.studyTime}"></label>
              <label class="field"><span>Minutes a day</span><select class="input" name="dailyMinutes" id="sc-daily">${[25, 30, 45, 50, 60, 75, 90, 120].map((m) => html`<option value="${m}" ${Number(set.dailyMinutes) === m ? 'selected' : ''}>${m}</option>`)}</select></label>
              <label class="field"><span>Session length</span><select class="input" name="sessionMinutes" id="sc-len">${[15, 20, 25, 30, 45].map((m) => html`<option value="${m}" ${Number(set.sessionMinutes) === m ? 'selected' : ''}>${m} min</option>`)}</select></label>
            </div>
            <div class="btn-row"><button class="btn small" type="submit">Save schedule</button></div>
          </form>
        </section>

        ${notifSection(s)}
        ${cloudSection(s)}

        <section class="card" aria-labelledby="ai-h">
          <div class="card-head"><h2 id="ai-h">AI tutor</h2></div>
          <div class="switch-row"><div class="txt"><b>Use a real AI when available</b><small>The app always checks the math and keeps the "hints, not answers" rule. ${IS_ARTIFACT ? 'Here the AI is Claude, through your claude.ai account.' : 'The AI needs the optional cloud tutor; otherwise the built-in tutor answers (works offline).'}</small></div>${sw('tutor-ai', set.tutorEngine !== 'built-in')}</div>
        </section>

        <section class="card" aria-labelledby="ins-h">
          <div class="card-head"><h2 id="ins-h">Install the app</h2>${inst === 'installed' ? html`<span class="pill good">${icon('check')}Installed</span>` : ''}</div>
          ${installSteps()}
          ${inst === 'prompt' ? html`<div class="btn-row mt"><button class="btn small" type="button" data-action="install-now">${icon('download')}Install now</button></div>` : ''}
        </section>

        <section class="card" aria-labelledby="ap-h">
          <div class="card-head"><h2 id="ap-h">Appearance</h2></div>
          <div class="seg" role="group" aria-label="Theme">
            ${[['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(
              ([v, l]) => html`<button type="button" data-action="theme" data-theme="${v}" aria-pressed="${set.theme === v ? 'true' : 'false'}">${l}</button>`,
            )}
          </div>
        </section>

        <section class="card" aria-labelledby="demo-h">
          <div class="card-head"><h2 id="demo-h">Demo & program</h2></div>
          <div class="stack">
            ${s.demo
              ? html`<p class="small muted">You're looking at sample data for “${s.profile.nickname}”.</p>
                <div class="btn-row"><button class="btn small secondary" type="button" data-action="reset-demo">${icon('refresh')}Reset sample data</button><button class="btn small" type="button" data-action="exit-demo">Exit demo</button></div>`
              : html`<p class="small muted">Show someone how StudyPath works with a made-up student. Your own data is kept aside and comes back when you exit.</p>
                <div class="btn-row"><button class="btn small secondary" type="button" data-action="start-demo">${icon('users')}Try with sample data</button></div>`}
            <p class="small muted">Program started ${fmtDate(s.program.startDate, { month: 'long', day: 'numeric' })}.</p>
            <div class="btn-row"><button class="btn small ghost" type="button" data-action="restart-program">${icon('refresh')}Restart the 10-week program</button></div>
          </div>
        </section>
      </div>
      <div>
        <section class="card tinted">
          <div class="row between wrap"><div><b>StudyPath AI</b> <span class="small muted">· demo version 1.0 · ${IS_ARTIFACT ? 'online demo' : 'web app'}</span>
            <p class="small muted">A student project: an 8–10 week program that uses an AI tutor and students' own learning data to help them understand the material, build better study habits and improve their grades, while protecting their privacy.</p></div></div>
        </section>
      </div>`;
  },
  mounted(root, s, route, ctx) {
    upcomingReminders(5).then((list) => {
      const changed = JSON.stringify(list.map((x) => x.key)) !== JSON.stringify(upcoming.map((x) => x.key));
      upcoming = list;
      if (changed) ctx.render();
    });
  },
  forms: {
    profile: (data) => {
      A.updateProfile({ nickname: data.nickname, gradeLevel: data.gradeLevel, goalAverage: data.goalAverage, avatar: data.avatar || store.state.profile.avatar });
      toast('Profile saved.');
    },
    schedule: (data) => {
      const days = (Array.isArray(data.studyDays) ? data.studyDays : []).map(Number);
      if (!days.length) return toast('Pick at least one study day.', { iconName: 'info' });
      A.updateSettings({ studyDays: days, studyTime: data.studyTime || '17:00', dailyMinutes: Number(data.dailyMinutes), sessionMinutes: Number(data.sessionMinutes) });
      checkReminders();
      toast('Schedule saved. Your plan is updated.');
    },
    quiet: (data) => {
      A.updateSettings({ quietStart: data.quietStart || '21:30', quietEnd: data.quietEnd || '07:00' });
      checkReminders();
      toast('Quiet hours saved.');
    },
  },
  changes: {
    'import-file': (el, e, ctx) => importFromInput(el, ctx, { replacing: true }),
    'notif-master': async (el, e, ctx) => {
      if (el.checked) {
        const p = await requestPermission();
        if (p === 'granted') {
          A.updateSettings({ notifications: { enabled: true } });
          toast('Notifications are on.', { iconName: 'bell' });
          checkReminders();
        } else {
          el.checked = false;
          toast(p === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Notifications were not allowed.', { iconName: 'info' });
          ctx.render();
        }
      } else {
        A.updateSettings({ notifications: { enabled: false } });
      }
    },
    'notif-study': (el) => A.updateSettings({ notifications: { study: el.checked } }),
    'notif-tests': (el) => A.updateSettings({ notifications: { tests: el.checked } }),
    'notif-grades': (el) => A.updateSettings({ notifications: { grades: el.checked } }),
    'notif-checkin': (el) => A.updateSettings({ notifications: { checkin: el.checked } }),
    'notif-streak': (el) => A.updateSettings({ notifications: { streak: el.checked } }),
    'notif-program': (el) => A.updateSettings({ notifications: { program: el.checked } }),
    'tutor-ai': (el) => A.updateSettings({ tutorEngine: el.checked ? 'auto' : 'built-in' }),
    'consent-cloud': async (el, e, ctx) => {
      if (el.checked) {
        A.updateConsent({ cloud: true });
        const ok = await cloud.enable();
        if (ok) toast('Your data is backed up.', { iconName: 'cloud' });
      } else {
        const del = await confirmSheet({
          title: 'Turn off cloud backup?',
          body: 'StudyPath will stop syncing. Do you also want to delete the copy that is already in the cloud?',
          confirm: 'Turn off and delete cloud copy',
          cancel: 'Turn off, keep the copy',
          danger: true,
        });
        A.updateConsent({ cloud: false });
        await cloud.disable({ deleteRemote: del });
        toast(del ? 'Cloud backup is off and the cloud copy was deleted.' : 'Cloud backup is off.', { iconName: 'cloud_off' });
      }
      ctx.render();
    },
    'consent-research': async (el) => {
      A.updateConsent({ research: el.checked });
      await cloud.syncNow?.();
      toast(el.checked ? 'Thank you! Only anonymous totals are shared.' : 'You are no longer part of the research totals.', { iconName: el.checked ? 'heart' : 'info' });
    },
  },
  actions: {
    'pick-import': () => pickImport(),
    'test-notif': async () => {
      const p = permission() === 'granted' ? 'granted' : await requestPermission();
      if (p !== 'granted') return toast('Allow notifications first.', { iconName: 'info' });
      const n = await testNotification();
      if (!n?.system) toast('Sent. If nothing appeared, check your device\'s notification settings for this browser.', { iconName: 'info' });
    },
    theme: (el) => A.updateSettings({ theme: el.dataset.theme }),
    'sync-now': async () => {
      const ok = await cloud.syncNow();
      toast(ok ? 'Synced.' : 'Could not sync right now. It will retry.', { iconName: ok ? 'cloud' : 'cloud_off' });
    },
    'export-json': async () => {
      const data = A.exportData();
      await download(`studypath-data-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    },
    'export-csv': async () => {
      await download(`studypath-grades-${todayISO()}.csv`, A.exportCSV('grades'), 'text/csv');
      await download(`studypath-study-log-${todayISO()}.csv`, A.exportCSV('sessions'), 'text/csv');
    },
    'delete-all': async (el, e, ctx) => {
      const ok = await confirmSheet({
        title: 'Delete all your data?',
        body: `This erases your classes, grades, plan, tutor chats and check-ins from this device${store.state.consent.cloud ? ' and from the cloud' : ''}. It can't be undone.`,
        confirm: 'Delete everything',
        danger: true,
      });
      if (!ok) return;
      try {
        await A.deleteAllData();
        location.hash = '';
        toast('All your data was deleted.', { iconName: 'trash' });
      } catch (err) {
        toast(`Could not delete the cloud copy: ${err.message}. Nothing was deleted.`, { iconName: 'alert', timeout: 9000 });
      }
    },
    'start-demo': async (el, e, ctx) => {
      await A.enterDemo();
      ctx.go('#today');
      toast('Sample data loaded. Exit the demo any time to get your data back.', { iconName: 'users' });
    },
    'restart-program': async () => {
      const ok = await confirmSheet({ title: 'Restart the program?', body: 'Week 1 starts today. Your grades and study history stay.', confirm: 'Restart' });
      if (ok) {
        A.restartProgram();
        toast('The 10-week program starts again today.');
      }
    },
    'install-now': async () => {
      await promptInstall();
    },
  },
};

export const inbox = {
  title: 'Notifications',
  render(s) {
    const items = s.inbox.slice().sort((a, b) => b.at - a.at);
    const ic = { study: 'clock', tests: 'calendar', grades: 'down', checkin: 'smile', streak: 'flame', program: 'book', info: 'bell' };
    return html`
      <div class="page-head">
        <div><h1>Notifications</h1><p>Every reminder and alert, also when you missed it.</p></div>
        <div class="btn-row">
          <a class="btn secondary" href="#profile" data-action="goto-notif-settings">${icon('gear')}Settings</a>
          ${items.some((n) => !n.read) ? html`<button class="btn" type="button" data-action="read-all">${icon('check')}Mark all read</button>` : ''}
        </div>
      </div>
      <section class="card">
        ${items.length
          ? html`<div class="list">${items.map(
              (n) => html`<a class="inbox-item ${n.read ? '' : 'unread'}" href="${n.url || '#today'}" data-action="open-notif" data-id="${n.id}">
                <span class="ic">${icon(ic[n.type] || 'bell')}</span>
                <span class="grow"><b>${n.title}</b><p>${n.body}</p><span class="tiny faint">${fmtAgo(n.at)}</span></span>
              </a>`,
            )}</div>`
          : emptyState({ iconName: 'bell', title: 'No notifications yet', body: 'Study reminders, test alerts and grade alerts will show up here.' })}
      </section>
      ${items.length ? html`<div class="btn-row mt"><button class="btn small ghost" type="button" data-action="clear-inbox">${icon('trash')}Clear all</button></div>` : ''}`;
  },
  actions: {
    'read-all': () => A.markInboxRead(),
    'clear-inbox': () => A.clearInbox(),
    'open-notif': (el) => {
      const n = store.state.inbox.find((x) => x.id === el.dataset.id);
      if (n && !n.read) A.track('reminder_opened', { type: n.type || 'info', by: 'inbox' });
      A.markInboxRead(el.dataset.id);
    },
    'goto-notif-settings': (el, e, ctx) => {
      e.preventDefault();
      ctx.go('#profile');
      setTimeout(() => document.getElementById('notifications')?.scrollIntoView({ block: 'start' }), 60);
    },
  },
};

export default profile;
