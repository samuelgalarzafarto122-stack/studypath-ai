// Home: how am I doing, what do I do today, what's coming up.

import { html, fmtDate, todayISO, fmtNum, fmtMinutes, weekday } from '../util.js';
import { activeClasses, overallAverage, overallTrend, classAverage, upcomingTests, classById, status } from '../logic/grades.js';
import { currentWeek, weekInfo, challengeProgress, programFinished } from '../logic/program.js';
import { METHODS } from '../logic/planner.js';
import { streak, weeklyMinutes, tutorStats, checkinThisWeek } from '../logic/stats.js';
import { computeInsights } from '../logic/insights.js';
import { icon } from '../ui/icons.js';
import { statusPill, trendPill, avgText, barFor, classDot, dateChip, whenText, emptyState } from '../ui/parts.js';
import { installCard, promptInstall, dismissInstall, installSteps } from '../install.js';
import { openSheet, toast } from '../ui/dom.js';
import * as A from '../actions.js';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function insightList(items) {
  return html`<div class="list">
    ${items.map(
      (x) => html`<div class="insight ${x.tone}"><div class="ic">${icon(x.icon)}</div><div class="grow"><b>${x.title}</b><p>${x.body}</p></div></div>`,
    )}
  </div>`;
}

export function planSessionRow(s, sess, date, { compact = false } = {}) {
  const cls = classById(s, sess.classId);
  const running = s.timer && s.timer.planSessionId === sess.id;
  return html`<div class="session ${sess.done ? 'done' : ''}">
    <button class="tick" type="button" data-action="toggle-session" data-date="${date}" data-id="${sess.id}" aria-pressed="${sess.done ? 'true' : 'false'}" aria-label="${sess.done ? 'Mark not done' : 'Mark done'}: ${sess.title}">${icon('check')}</button>
    <div class="s-main">
      <div class="s-title">${sess.title}</div>
      <div class="s-sub">${cls ? html`${classDot(cls)}${cls.name} · ` : ''}${sess.minutes} min · ${METHODS[sess.method]?.short || 'Study'}${compact ? '' : html` · ${fmtTimeShort(sess.start)}`}</div>
    </div>
    ${sess.done
      ? ''
      : html`<div class="s-actions">
          ${sess.method === 'tutor'
            ? html`<a class="btn small soft" href="#tutor" data-action="tutor-from-plan" data-class="${sess.classId}">Open</a>`
            : html`<button class="btn small ${running ? '' : 'soft'}" type="button" data-action="start-timer" data-class="${sess.classId}" data-method="${sess.method}" data-minutes="${sess.minutes}" data-title="${sess.title}" data-plan-date="${date}" data-plan-session="${sess.id}" aria-label="Start timer for ${sess.title}">${icon(running ? 'clock' : 'play')}${running ? 'Running' : 'Start'}</button>`}
        </div>`}
  </div>`;
}

function fmtTimeShort(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const sessionActions = {
  'toggle-session': (el) => {
    const date = el.dataset.date;
    const plan = A.refreshPlan(date) || null;
    const sess = plan?.sessions?.find((x) => x.id === el.dataset.id);
    if (!sess) return;
    A.setPlanSessionDone(date, sess.id, !sess.done);
    if (!sess.done) toast(`${sess.minutes} minutes logged.`, { title: 'Session done', iconName: 'check' });
  },
  'tutor-from-plan': (el, e, ctx) => {
    e.preventDefault();
    try {
      sessionStorage.setItem('sp:tutor-class', el.dataset.class || '');
    } catch {}
    ctx.go('#tutor');
  },
};

export default {
  title: 'Today',
  render(s) {
    const today = todayISO();
    const classes = activeClasses(s);
    const avg = overallAverage(s);
    const goal = Number(s.profile.goalAverage) || 85;
    const trend = overallTrend(s, 30);
    const plan = s.plans[today];
    const sessions = plan?.sessions || [];
    const done = sessions.filter((x) => x.done).length;
    const next = sessions.find((x) => !x.done);
    const tests = upcomingTests(s, today, 21).slice(0, 3);
    const week = currentWeek(s);
    const info = weekInfo(week);
    const ch = challengeProgress(s, week);
    const st = streak(s);
    // "this week" = the current program week, the same week the Progress charts and challenges use
    const wk = weeklyMinutes(s, todayISO());
    const mins = wk.length ? wk[wk.length - 1].minutes : 0;
    const ts = tutorStats(s);
    const insights = computeInsights(s).slice(0, 2);
    const wd = weekday(today);
    const needCheckin = !checkinThisWeek(s, week) && (wd === 0 || wd >= 5);
    const counts = { help: 0, watch: 0, track: 0 };
    for (const c of classes) {
      const k = status(classAverage(s, c.id)).key;
      if (k in counts) counts[k]++;
    }

    return html`
      <div class="page-head">
        <div>
          <h1>${greeting()}${s.profile.nickname ? `, ${s.profile.nickname}` : ''} 👋</h1>
          <p>${fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })} · ${programFinished(s) ? 'Program complete' : `Week ${week} of 10: ${info.title}`}</p>
        </div>
      </div>

      ${!classes.length
        ? html`<section class="card">${emptyState({
            iconName: 'grades',
            title: 'Add your classes to get started',
            body: 'StudyPath builds your plan from your grades and upcoming tests.',
            action: html`<button class="btn" type="button" data-action="add-class">${icon('plus')}Add a class</button>`,
          })}</section>`
        : html`
      <div class="grid home">
        <div class="stack loose">
          <section class="card" aria-labelledby="avg-h">
            <div class="card-head"><span class="eyebrow" id="avg-h">Current average</span>${trendPill(trend)}</div>
            <div class="row between wrap">
              <div class="big-num num">${avgText(avg)}<small>/ 100 · Goal ${goal}</small></div>
            </div>
            <div class="mt">${barFor(avg, goal)}</div>
            <div class="row wrap mt small muted">
              ${counts.help ? html`<span class="pill bad">${counts.help} need${counts.help === 1 ? 's' : ''} help</span>` : ''}
              ${counts.watch ? html`<span class="pill warn">${counts.watch} to watch</span>` : ''}
              ${counts.track ? html`<span class="pill good">${counts.track} on track</span>` : ''}
              <a class="link-btn" href="#grades" style="margin-left:auto">See grades ${icon('right')}</a>
            </div>
          </section>

          <section class="card" aria-labelledby="plan-h">
            <div class="card-head">
              <div><h2 id="plan-h">Today's plan</h2><div class="small muted">${sessions.length ? `${done} of ${sessions.length} done · ${fmtMinutes(sessions.reduce((a, b) => a + b.minutes, 0))}` : plan?.rest ? 'Rest day' : 'Nothing planned'}</div></div>
              <a class="link-btn" href="#plan">Open plan ${icon('right')}</a>
            </div>
            ${sessions.length
              ? html`
                ${plan.why ? html`<p class="why"><b>Why this plan?</b> ${plan.why}</p>` : ''}
                <div class="mt">${sessions.slice(0, 4).map((x) => planSessionRow(s, x, today))}</div>
                ${!next ? html`<div class="notice good mt">${icon('star')}<span>All done for today. Great job! Rest is part of the plan.</span></div>` : ''}`
              : html`<p class="muted">${plan?.why || 'Your plan will appear here.'}</p>
                <div class="btn-row mt"><button class="btn small soft" type="button" data-action="log-session">${icon('plus')}Log a session anyway</button></div>`}
          </section>

          <section class="card" aria-labelledby="tests-h">
            <div class="card-head"><h2 id="tests-h">Upcoming tests</h2><button class="link-btn" type="button" data-action="add-test">${icon('plus')}Add</button></div>
            ${tests.length
              ? html`<div class="list">${tests.map((t) => {
                  const c = classById(s, t.classId);
                  return html`<button class="list-item" type="button" data-action="edit-test" data-id="${t.id}">${dateChip(t.date, today)}
                    <div class="li-main"><div class="li-title">${c ? c.name : 'Test'} · ${t.title}</div><div class="li-sub">${whenText(t.date, today)}${t.topics ? ` · ${t.topics}` : ''}</div></div>${icon('right')}</button>`;
                })}</div>`
              : html`<p class="muted small">No tests in the next 3 weeks. Add one when your teacher announces it, and your plan will prepare you.</p>`}
          </section>
        </div>

        <div class="stack loose">
          <div class="stats">
            <div class="stat"><div class="v num">${st}${st ? ' 🔥' : ''}</div><div class="l">day streak</div></div>
            <div class="stat"><div class="v num">${fmtMinutes(mins, { short: true })}</div><div class="l">studied this week</div></div>
            <div class="stat"><div class="v num">${ts.solved}</div><div class="l">solved with tutor</div></div>
          </div>

          ${needCheckin
            ? html`<section class="card soft"><div class="row top"><div class="brand-mark" aria-hidden="true">${icon('smile')}</div><div class="grow stack tight">
                <h3>Weekly check-in</h3><p class="small muted">Two minutes: how did week ${week} go?</p>
                <div><button class="btn small" type="button" data-action="checkin">Check in</button></div></div></div></section>`
            : ''}

          <section class="card" aria-labelledby="habit-h">
            <div class="card-head"><span class="eyebrow accent" id="habit-h">This week's habit</span><span class="pill">${week} / 10</span></div>
            <h3>${info.habit}</h3>
            <p class="small muted mt">${ch.text}</p>
            <div class="row mt"><div class="bar grow"><i style="width:${Math.round((ch.done / ch.target) * 100)}%"></i></div><span class="small strong num">${ch.done}/${ch.target}</span></div>
            <div class="btn-row mt"><a class="btn small soft" href="#program">${icon('book')}3-minute lesson</a></div>
          </section>

          <section class="card" aria-labelledby="ins-h">
            <div class="card-head"><h2 id="ins-h">What your data says</h2><a class="link-btn" href="#progress">Progress ${icon('right')}</a></div>
            ${insights.length ? insightList(insights) : html`<p class="muted small">After a couple of weeks of grades and study sessions, StudyPath will point out what's working for you.</p>`}
          </section>

          ${installCard()}
        </div>
      </div>`}`;
  },
  actions: {
    ...sessionActions,
    install: async () => {
      const r = await promptInstall();
      if (r === 'accepted') toast('Installed! Open StudyPath from your home screen or apps.', { iconName: 'check' });
    },
    'install-help': () => openSheet({ title: 'Install StudyPath', body: installSteps(), foot: html`<button class="btn" type="button" data-close>Got it</button>` }),
    'install-dismiss': (el, e, ctx) => {
      dismissInstall();
      ctx.render();
    },
  },
};
