// First run: welcome → privacy & consent → about you → classes → study schedule → notifications.

import { html, raw } from '../util.js';
import { IS_ARTIFACT } from '../env.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/dom.js';
import { requestPermission, support, permission } from '../notify.js';
import { cloud } from '../cloud/index.js';
import * as A from '../actions.js';
import { importInput, pickImport, importFromInput } from '../ui/importer.js';

const STEPS = ['welcome', 'privacy', 'about', 'classes', 'schedule', 'notify'];
let step = 0;
const draft = {
  consent: { privacy: false, ageOk: false, cloud: false, research: false },
  nickname: '',
  gradeLevel: '10',
  goalAverage: 85,
  classes: [
    { name: '', startGrade: '', target: '' },
    { name: '', startGrade: '', target: '' },
    { name: '', startGrade: '', target: '' },
  ],
  settings: { studyDays: [1, 2, 3, 4, 5], studyTime: '17:00', dailyMinutes: 50, sessionMinutes: 25 },
};
let error = '';

const DAYS = [
  [1, 'M', 'Monday'],
  [2, 'T', 'Tuesday'],
  [3, 'W', 'Wednesday'],
  [4, 'T', 'Thursday'],
  [5, 'F', 'Friday'],
  [6, 'S', 'Saturday'],
  [0, 'S', 'Sunday'],
];

function logo() {
  return raw(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="18" r="2.3"/><circle cx="18" cy="6" r="2.3"/><path d="M8.3 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.7"/></svg>',
  );
}

function steps() {
  return html`<div class="onb-steps" aria-label="Step ${step} of ${STEPS.length - 1}">${STEPS.slice(1).map((_, i) => html`<i class="${i < step ? 'on' : ''}"></i>`)}</div>`;
}

function nav({ next = 'Continue', back = true } = {}) {
  return html`<div class="btn-row mt-lg" style="justify-content:space-between">
    ${back ? html`<button class="btn ghost" type="button" data-action="onb-back">${icon('left')}Back</button>` : html`<span></span>`}
    <button class="btn" type="submit">${next}${icon('right')}</button>
  </div>`;
}

function readClassRows() {
  const rows = [...document.querySelectorAll('[data-class-row]')];
  if (!rows.length) return;
  draft.classes = rows.map((r) => ({
    name: r.querySelector('[name="cname"]').value,
    startGrade: r.querySelector('[name="cgrade"]').value,
    target: r.querySelector('[name="ctarget"]').value,
  }));
}

function welcome() {
  return html`<div class="onb-card">
    <div class="brand" style="margin-top:8px"><span class="brand-mark">${logo()}</span>StudyPath AI</div>
    <div class="hero">
      <div>
        <h1>Raise your grades with a plan that fits you</h1>
        <p class="lede">A 10-week program with a study plan built from your grades, an AI tutor that gives hints instead of answers, and reminders so you keep going.</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="mini">${icon('plan')}<div><b>Today: Math first</b><div class="small muted">Test in 3 days · 2 × 25 min</div></div></div>
        <div class="mini">${icon('tutor')}<div><b>“What can you do to both sides?”</b><div class="small muted">Hint 2 of 4, never the answer</div></div></div>
        <div class="mini">${icon('up')}<div><b>Average +4.2 this month</b><div class="small muted">Studying works in Math</div></div></div>
      </div>
      <div class="feature-list">
        <div class="feature"><span class="ic">${icon('target')}</span><div><b>Know where you stand</b><p>Add grades and tests; see which classes need help.</p></div></div>
        <div class="feature"><span class="ic">${icon('bell')}</span><div><b>Reminders that help</b><p>Study time, upcoming tests and grade drops.</p></div></div>
        <div class="feature"><span class="ic">${icon('shield')}</span><div><b>Private by design</b><p>Nickname only. You decide what is shared.</p></div></div>
      </div>
      <div class="btn-row">
        <button class="btn" type="button" data-action="onb-start">Get started${icon('right')}</button>
        <button class="btn secondary" type="button" data-action="onb-demo">${icon('users')}Try it with sample data</button>
      </div>
      <p class="small muted">Made for high school students. Takes about 2 minutes to set up.</p>
      <p class="small muted">Already use StudyPath on another device? <button class="link-btn" type="button" data-action="pick-import">${icon('upload')}Bring your data from a file</button>${importInput()}</p>
    </div>
  </div>`;
}

function privacy() {
  const c = draft.consent;
  return html`<form class="onb-card" data-form="onb-privacy" novalidate>
    ${steps()}
    <h1>Your privacy comes first</h1>
    <p class="lede">Please read this. It's short.</p>
    <div class="privacy-box mt-lg">
      <b>How StudyPath uses your data</b>
      <ul>
        <li>You use a <b>nickname</b>. StudyPath never asks for your real name, email, school or phone number.</li>
        <li>Your grades, plan, tutor chats and check-ins are saved <b>on this device</b>.${IS_ARTIFACT
          ? ' With cloud backup on, a copy is kept in your private space on claude.ai, which only you can open.'
          : ' With cloud backup on, a copy is saved online under a random ID (no name or email). Other students can\'t see it; the person who runs this copy of StudyPath manages that database.'}</li>
        <li>Your data is used to build <b>your</b> plan and insights. It is never sold or used for ads.</li>
        <li>Research only gets a summary of numbers, if you opt in: <b>no names, no notes, no chat text</b>. The dashboard only shows totals for groups of students.</li>
        <li>You can download or delete everything at any time in Profile.</li>
        <li>The tutor is software, not a person. If you're going through something hard, talk to a trusted adult or counselor (in the US, call or text <b>988</b>).</li>
      </ul>
    </div>
    <div class="stack mt-lg">
      <label class="check"><input type="checkbox" name="privacy" id="ob-privacy" ${c.privacy ? 'checked' : ''}><span><b>I read how StudyPath uses my data</b><small>Required</small></span></label>
      <label class="check"><input type="checkbox" name="ageOk" id="ob-age" ${c.ageOk ? 'checked' : ''}><span><b>I'm 13 or older, and if I'm under 18, a parent or guardian knows I'm using StudyPath</b><small>Required</small></span></label>
      <label class="check"><input type="checkbox" name="cloud" id="ob-cloud" ${c.cloud ? 'checked' : ''}><span><b>Back up my data in the cloud</b><small>${IS_ARTIFACT
        ? 'Optional, recommended. Keeps a copy in your claude.ai account, so you can open it on another device.'
        : 'Optional, recommended. Saves a copy online under a random ID, with no name or email.'}</small></span></label>
      <label class="check"><input type="checkbox" name="research" id="ob-research" ${c.research ? 'checked' : ''}><span><b>Add my anonymous totals to the research project</b><small>Optional. Needs cloud backup. Helps find out if the program works.</small></span></label>
    </div>
    ${error ? html`<p class="error-text mt" role="alert">${error}</p>` : ''}
    ${nav()}
  </form>`;
}

function about() {
  return html`<form class="onb-card" data-form="onb-about" novalidate>
    ${steps()}
    <h1>About you</h1>
    <p class="lede">Just the basics. Use a nickname, not your full name.</p>
    <div class="stack mt-lg">
      <label class="field"><span>Nickname</span><input class="input" name="nickname" id="ob-nick" maxlength="24" placeholder="Alex" value="${draft.nickname}" autocomplete="off" autofocus></label>
      <div class="form-grid two">
        <label class="field"><span>Grade</span><select class="input" name="gradeLevel" id="ob-grade">${['9', '10', '11', '12'].map((g) => html`<option value="${g}" ${draft.gradeLevel === g ? 'selected' : ''}>${g}th grade</option>`)}</select></label>
        <label class="field"><span>Goal for your overall average</span><input class="input" name="goalAverage" id="ob-goal" inputmode="numeric" value="${draft.goalAverage}"></label>
      </div>
      <p class="hint">Pick a goal that's a step up from where you are now, like 5 points higher. You can change it any time.</p>
    </div>
    ${error ? html`<p class="error-text mt" role="alert">${error}</p>` : ''}
    ${nav()}
  </form>`;
}

function classes() {
  return html`<form class="onb-card" data-form="onb-classes" novalidate>
    ${steps()}
    <h1>Your classes</h1>
    <p class="lede">Add the classes you're taking and your current grade in each (check your school portal). Leave the grade empty if you don't know it yet.</p>
    <div class="stack mt-lg">
      <div class="class-input-row small muted strong" aria-hidden="true"><span>Class</span><span>Grade %</span><span>Goal</span><span></span></div>
      ${draft.classes.map(
        (c, i) => html`<div class="class-input-row" data-class-row>
          <input class="input" name="cname" id="ob-cn-${i}" maxlength="40" placeholder="${['Algebra 2', 'Biology', 'English 10', 'World History', 'Chemistry'][i % 5]}" value="${c.name}" aria-label="Class ${i + 1} name" autocomplete="off">
          <input class="input" name="cgrade" id="ob-cg-${i}" inputmode="decimal" placeholder="74" value="${c.startGrade}" aria-label="Class ${i + 1} current grade">
          <input class="input" name="ctarget" id="ob-ct-${i}" inputmode="numeric" placeholder="${draft.goalAverage}" value="${c.target}" aria-label="Class ${i + 1} goal">
          <button class="icon-btn" type="button" data-action="onb-remove" data-i="${i}" aria-label="Remove class ${i + 1}">${icon('x')}</button>
        </div>`,
      )}
      <div><button class="btn small secondary" type="button" data-action="onb-add">${icon('plus')}Add another class</button></div>
    </div>
    ${error ? html`<p class="error-text mt" role="alert">${error}</p>` : ''}
    ${nav()}
  </form>`;
}

function schedule() {
  const st = draft.settings;
  return html`<form class="onb-card" data-form="onb-schedule" novalidate>
    ${steps()}
    <h1>When can you study?</h1>
    <p class="lede">Short sessions on a regular schedule work better than long cramming. Start small: you can change this later.</p>
    <div class="stack mt-lg">
      <div class="field"><span>Study days</span><div class="days">${DAYS.map(
        ([v, l, full]) => html`<label><input type="checkbox" name="studyDays" value="${v}" ${st.studyDays.includes(v) ? 'checked' : ''} aria-label="${full}" id="ob-day-${v}"><span aria-hidden="true">${l}</span></label>`,
      )}</div></div>
      <div class="form-grid three">
        <label class="field"><span>Start time</span><input class="input" type="time" name="studyTime" id="ob-time" value="${st.studyTime}"></label>
        <label class="field"><span>Minutes a day</span><select class="input" name="dailyMinutes" id="ob-daily">${[25, 30, 45, 50, 60, 75, 90].map((m) => html`<option value="${m}" ${Number(st.dailyMinutes) === m ? 'selected' : ''}>${m}</option>`)}</select></label>
        <label class="field"><span>Session length</span><select class="input" name="sessionMinutes" id="ob-len">${[15, 20, 25, 30].map((m) => html`<option value="${m}" ${Number(st.sessionMinutes) === m ? 'selected' : ''}>${m} min</option>`)}</select></label>
      </div>
    </div>
    ${error ? html`<p class="error-text mt" role="alert">${error}</p>` : ''}
    ${nav()}
  </form>`;
}

function notifyStep() {
  const sup = support();
  const perm = permission();
  return html`<form class="onb-card" data-form="onb-finish" novalidate>
    ${steps()}
    <h1>Stay on track with reminders</h1>
    <p class="lede">StudyPath can remind you when it's time to study, before each test, and when a grade drops. You choose which ones in Profile, and there are quiet hours at night.</p>
    <div class="stack mt-lg">
      ${IS_ARTIFACT
        ? html`<div class="notice">${icon('info')}<span>In this online demo, reminders appear inside the app (bell icon). Install the app version to get them on your phone or computer.</span></div>`
        : sup.needsInstall
          ? html`<div class="notice warn">${icon('phone')}<span><b>On iPhone:</b> first add StudyPath to your Home Screen (Share → Add to Home Screen) and open it from there. Then turn on notifications in Profile.</span></div>`
          : perm === 'granted'
            ? html`<div class="notice good">${icon('check')}<span>Notifications are allowed. You're all set.</span></div>`
            : perm === 'unsupported'
              ? html`<div class="notice">${icon('info')}<span>This browser can't show notifications, but you'll see every reminder in the app.</span></div>`
              : html`<button class="btn soft" type="button" data-action="onb-notif">${icon('bell')}Turn on notifications</button>`}
    </div>
    ${nav({ next: 'Start my plan' })}
  </form>`;
}

async function finish(ctx) {
  const classes = draft.classes
    .filter((c) => c.name.trim())
    .map((c) => ({
      name: c.name,
      startGrade: c.startGrade === '' ? null : Number(String(c.startGrade).replace(',', '.')),
      target: c.target === '' ? draft.goalAverage : Number(c.target),
    }));
  const notifOn = permission() === 'granted';
  A.completeOnboarding({
    nickname: draft.nickname,
    gradeLevel: draft.gradeLevel,
    goalAverage: draft.goalAverage,
    consent: draft.consent,
    classes,
    settings: { ...draft.settings, notifications: { enabled: notifOn } },
  });
  step = 0;
  ctx.go('#today');
  toast('Your plan for today is ready.', { title: `Welcome${draft.nickname ? `, ${draft.nickname}` : ''}! 🎉`, iconName: 'star' });
  if (draft.consent.cloud) {
    const ok = await cloud.enable();
    if (!ok && cloud.status().state === 'not-configured') toast('Cloud backup is not set up in this copy yet, so your data stays on this device.', { iconName: 'info', timeout: 8000 });
  }
}

export default {
  title: 'Welcome',
  render() {
    const body = [welcome, privacy, about, classes, schedule, notifyStep][step]();
    return html`<div class="onb">${body}</div>`;
  },
  mounted() {
    const f = document.querySelector('.onb input[autofocus]');
    if (f && matchMedia('(pointer: fine)').matches) f.focus({ preventScroll: true });
  },
  changes: {
    'import-file': (el, e, ctx) => importFromInput(el, ctx),
  },
  actions: {
    'pick-import': () => pickImport(),
    'onb-start': (el, e, ctx) => {
      step = 1;
      error = '';
      ctx.render();
      window.scrollTo(0, 0);
    },
    'onb-demo': async (el, e, ctx) => {
      await A.enterDemo();
      ctx.go('#today');
      toast('This is “Alex”, a made-up student in week 6. Explore everything; exit the demo any time from the yellow banner.', { title: 'Sample data loaded', iconName: 'users', timeout: 9000 });
    },
    'onb-back': (el, e, ctx) => {
      if (step === 3) readClassRows();
      step = Math.max(0, step - 1);
      error = '';
      ctx.render();
      window.scrollTo(0, 0);
    },
    'onb-add': (el, e, ctx) => {
      readClassRows();
      if (draft.classes.length < 8) draft.classes.push({ name: '', startGrade: '', target: '' });
      ctx.render();
      document.getElementById(`ob-cn-${draft.classes.length - 1}`)?.focus();
    },
    'onb-remove': (el, e, ctx) => {
      readClassRows();
      draft.classes.splice(Number(el.dataset.i), 1);
      if (!draft.classes.length) draft.classes.push({ name: '', startGrade: '', target: '' });
      ctx.render();
    },
    'onb-notif': async (el, e, ctx) => {
      const p = await requestPermission();
      toast(p === 'granted' ? 'Notifications are on.' : 'No problem. You can turn them on later in Profile.', { iconName: p === 'granted' ? 'bell' : 'info' });
      ctx.render();
    },
  },
  forms: {
    'onb-privacy': (data, form, e, ctx) => {
      draft.consent = { privacy: data.privacy, ageOk: data.ageOk, cloud: data.cloud, research: data.cloud && data.research };
      if (!data.privacy || !data.ageOk) {
        error = 'Please check both required boxes to continue.';
        return ctx.render();
      }
      if (data.research && !data.cloud) toast('Research sharing needs cloud backup, so it stays off for now.', { iconName: 'info' });
      error = '';
      step = 2;
      ctx.render();
      window.scrollTo(0, 0);
    },
    'onb-about': (data, form, e, ctx) => {
      const goal = Number(data.goalAverage);
      draft.nickname = String(data.nickname || '').trim().slice(0, 24);
      draft.gradeLevel = data.gradeLevel;
      if (!Number.isFinite(goal) || goal < 60 || goal > 100) {
        error = 'Choose a goal between 60 and 100.';
        return ctx.render();
      }
      draft.goalAverage = goal;
      error = '';
      step = 3;
      ctx.render();
      window.scrollTo(0, 0);
    },
    'onb-classes': (data, form, e, ctx) => {
      readClassRows();
      const named = draft.classes.filter((c) => c.name.trim());
      const bad = named.find((c) => c.startGrade !== '' && !Number.isFinite(Number(String(c.startGrade).replace(',', '.'))));
      if (!named.length) {
        error = 'Add at least one class (you can add more later).';
        return ctx.render();
      }
      if (bad) {
        error = `Check the grade for ${bad.name}: use a number like 74.`;
        return ctx.render();
      }
      error = '';
      step = 4;
      ctx.render();
      window.scrollTo(0, 0);
    },
    'onb-schedule': (data, form, e, ctx) => {
      const days = (Array.isArray(data.studyDays) ? data.studyDays : []).map(Number);
      if (!days.length) {
        error = 'Pick at least one study day.';
        return ctx.render();
      }
      draft.settings = { studyDays: days, studyTime: data.studyTime || '17:00', dailyMinutes: Number(data.dailyMinutes) || 50, sessionMinutes: Number(data.sessionMinutes) || 25 };
      error = '';
      step = 5;
      ctx.render();
      window.scrollTo(0, 0);
    },
    'onb-finish': (data, form, e, ctx) => finish(ctx),
  },
};
