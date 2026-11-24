// Study plan: today's sessions (with the reason behind them), the week ahead, and the 10-week program.

import { html, todayISO, fmtDate, fmtMinutes, startOfWeekISO, addDays, weekday, fmtTime } from '../util.js';
import { activeClasses, classById } from '../logic/grades.js';
import { METHODS, weekPreview } from '../logic/planner.js';
import { PROGRAM, PROGRAM_WEEKS, currentWeek, weekRange, challengeProgress, lessonDone, programFinished } from '../logic/program.js';
import { minutesBetween } from '../logic/stats.js';
import { icon } from '../ui/icons.js';
import { classDot, emptyState } from '../ui/parts.js';
import { openSheet, toast } from '../ui/dom.js';
import { planSessionRow, sessionActions } from './today.js';
import * as A from '../actions.js';
import { store } from '../state.js';

function tabs(active) {
  return html`<nav class="seg" aria-label="Plan views">
    <a href="#plan" ${active === 'plan' ? html`aria-current="page"` : ''}>Today</a>
    <a href="#week" ${active === 'week' ? html`aria-current="page"` : ''}>This week</a>
    <a href="#program" ${active === 'program' ? html`aria-current="page"` : ''}>10-week program</a>
  </nav>`;
}

const METHOD_HELP = [
  ['recall', 'Active recall', 'Close your notes and write or say everything you remember. Then check. It feels harder than rereading, and that is why it works.'],
  ['flashcards', 'Flashcards (spaced)', 'Short reviews spread over days beat one long cram. Review the cards you miss more often.'],
  ['practice', 'Practice test', 'Do problems under test conditions: timed, no notes. Best in the last days before a test.'],
  ['review', 'Review + practice', 'Read one section, then do problems without looking. Good when a class needs catching up.'],
  ['mistakes', 'Fix mistakes', 'Redo what you got wrong and write why it went wrong. Mistakes show exactly what to study.'],
  ['teach', 'Teach it back', 'Explain it out loud in simple words. Where you get stuck is your gap.'],
];

function addSessionSheet(date) {
  const s = store.state;
  const classes = activeClasses(s);
  if (!classes.length) return toast('Add a class first.', { iconName: 'info' });
  openSheet({
    title: 'Add a session',
    body: html`<form class="stack" novalidate>
      <div class="form-grid two">
        <label class="field"><span>Class</span><select class="input" name="classId" id="as-class">${classes.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
        <label class="field"><span>Method</span><select class="input" name="method" id="as-method">${Object.entries(METHODS)
          .filter(([k]) => k !== 'custom')
          .map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></label>
      </div>
      <div class="form-grid two">
        <label class="field"><span>Minutes</span><input class="input" name="minutes" id="as-min" inputmode="numeric" value="${s.settings.sessionMinutes}"></label>
        <label class="field"><span>What exactly? (optional)</span><input class="input" name="title" id="as-title" maxlength="80" placeholder="Chapter 5 flashcards"></label>
      </div>
      <div class="sheet-foot"><button class="btn secondary" type="button" data-close>Cancel</button><button class="btn" type="submit">Add to plan</button></div>
    </form>`,
    onSubmit(data, form, close) {
      close();
      A.addPlanSession(date, data);
      toast('Added to your plan.');
    },
  });
}

function reminderNote(s, plan) {
  const next = (plan?.sessions || []).find((x) => !x.done);
  const on = s.settings.notifications;
  if (!next) return '';
  return html`<div class="notice mt">${icon('bell')}<span>${
    on.enabled && on.study
      ? html`You'll get a reminder at <b>${fmtTime(next.start)}</b> when your next session starts.`
      : html`Want a reminder at <b>${fmtTime(next.start)}</b>? <a href="#profile">Turn on notifications</a>.`
  }</span></div>`;
}

const plan = {
  title: 'Study plan',
  render(s) {
    const today = todayISO();
    const p = s.plans[today];
    const sessions = p?.sessions || [];
    const done = sessions.filter((x) => x.done);
    const total = sessions.reduce((a, b) => a + b.minutes, 0);
    return html`
      <div class="page-head">
        <div><h1>Study plan</h1><p>${fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
        ${tabs('plan')}
      </div>
      <div class="grid home">
        <section class="card" aria-labelledby="p-today">
          <div class="card-head">
            <div><h2 id="p-today">Today</h2><div class="small muted">${sessions.length ? `${done.length} of ${sessions.length} done · ${fmtMinutes(total)} planned` : p?.rest ? 'Rest day' : 'Nothing planned yet'}</div></div>
            <button class="btn small soft" type="button" data-action="add-session">${icon('plus')}Add</button>
          </div>
          ${p?.why ? html`<p class="why"><b>Why this plan?</b> ${p.why}</p>` : ''}
          ${sessions.length
            ? html`<div class="mt">${sessions.map((x) => planSessionRow(s, x, today))}</div>`
            : !activeClasses(s).length
              ? emptyState({ iconName: 'plan', title: 'No classes yet', body: 'Add your classes and the plan builds itself.', action: html`<button class="btn" type="button" data-action="add-class">Add a class</button>` })
              : ''}
          ${reminderNote(s, p)}
          <div class="btn-row mt">
            <button class="btn small secondary" type="button" data-action="log-session">${icon('clock')}Log a past session</button>
            ${p && !done.length && p.edited ? html`<button class="btn small ghost" type="button" data-action="rebuild">${icon('refresh')}Rebuild plan</button>` : ''}
          </div>
        </section>
        <div class="stack loose">
          <section class="card">
            <div class="card-head"><h2>How your plan is made</h2></div>
            <ul class="tips small">
              <li>Classes furthest below your goal get more time.</li>
              <li>A test in the next week moves its class to the top, with recall and practice tests.</li>
              <li>A class that dropped recently, or that you haven't studied in 5+ days, gets a boost.</li>
              <li>Sessions are short (${s.settings.sessionMinutes} min) with 5-minute breaks. Change this in <a href="#profile">Profile</a>.</li>
            </ul>
          </section>
          <section class="card">
            <div class="card-head"><h2>Study methods</h2></div>
            <div class="list">
              ${METHOD_HELP.map(([k, t, d]) => html`<details class="list-item disclose" style="display:block"><summary>${t}</summary><p class="small muted mt">${d}</p></details>`)}
            </div>
          </section>
        </div>
      </div>`;
  },
  actions: {
    ...sessionActions,
    'add-session': () => addSessionSheet(todayISO()),
    rebuild: () => {
      A.rebuildPlan(todayISO());
      toast('Plan rebuilt from your latest grades and tests.', { iconName: 'refresh' });
    },
    'remove-session': (el) => A.removePlanSession(el.dataset.date, el.dataset.id),
  },
};

export const week = {
  title: 'This week',
  render(s) {
    const today = todayISO();
    const start = startOfWeekISO(today);
    const days = weekPreview(s, start, today);
    const doneMin = minutesBetween(s, start, addDays(start, 6));
    const plannedMin = days.reduce((a, d) => a + (d.plan?.sessions || []).reduce((x, y) => x + y.minutes, 0), 0);
    return html`
      <div class="page-head">
        <div><h1>This week</h1><p>${fmtDate(start, { month: 'short', day: 'numeric' })} – ${fmtDate(addDays(start, 6), { month: 'short', day: 'numeric' })}</p></div>
        ${tabs('week')}
      </div>
      <section class="card">
        <div class="card-head"><h2>Overview</h2><span class="small muted"><b class="num">${fmtMinutes(doneMin)}</b> studied · ${fmtMinutes(plannedMin)} planned</span></div>
        <div class="week-strip">
          ${days.map((d) => {
            const ss = d.plan?.sessions || [];
            const rest = !ss.length;
            return html`<div class="week-day ${d.date === today ? 'today' : ''} ${rest ? 'rest' : ''}">
              <div class="d">${fmtDate(d.date, { weekday: 'short' })}</div>
              <div class="n">${Number(d.date.slice(8))}</div>
              <div class="m">${d.doneMinutes ? `${d.doneMinutes}m` : rest ? 'Rest' : `${ss.reduce((a, b) => a + b.minutes, 0)}m`}</div>
              <div class="pips">${ss.slice(0, 6).map((x) => html`<i class="c-${classById(s, x.classId)?.color || 's1'} ${x.done ? 'done' : ''}"></i>`)}</div>
            </div>`;
          })}
        </div>
      </section>
      <div class="grid two mt-lg">
        ${days
          .filter((d) => d.date >= today)
          .map(
            (d) => html`<section class="card">
              <div class="card-head"><h3>${d.date === today ? 'Today' : fmtDate(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}</h3><span class="small muted">${(d.plan?.sessions || []).length ? fmtMinutes(d.plan.sessions.reduce((a, b) => a + b.minutes, 0)) : ''}</span></div>
              ${(d.plan?.sessions || []).length
                ? html`<div class="list">${d.plan.sessions.map((x) => {
                    const c = classById(s, x.classId);
                    return html`<div class="list-item">${classDot(c)}<div class="li-main"><div class="li-title">${x.title}</div><div class="li-sub">${c?.name || ''} · ${x.minutes} min · ${fmtTime(x.start)}</div></div>${x.done ? html`<span class="pill good">${icon('check')}Done</span>` : ''}</div>`;
                  })}</div>`
                : html`<p class="small muted">${d.plan?.why || 'Rest day.'}</p>`}
              ${d.date > today ? html`<p class="hint mt">Preview: it updates as your grades and tests change.</p>` : ''}
            </section>`,
          )}
      </div>`;
  },
};

export const program = {
  title: '10-week program',
  render(s) {
    const cur = currentWeek(s);
    const finished = programFinished(s);
    return html`
      <div class="page-head">
        <div><h1>10-week program</h1><p>One research-backed study habit per week. Your challenge is checked automatically from what you do in the app.</p></div>
        ${tabs('program')}
      </div>
      <section class="card">
        <div class="row between wrap"><div><span class="eyebrow">${finished ? 'Program complete' : `Week ${cur} of ${PROGRAM_WEEKS}`}</span><h2 class="mt" style="margin-top:4px">${PROGRAM[cur - 1].title}</h2></div>
        <span class="small muted">Started ${fmtDate(s.program.startDate, { month: 'short', day: 'numeric' })}</span></div>
        <div class="progress-steps mt" aria-label="Program progress">${PROGRAM.map((w) => html`<i class="${w.n < cur || finished || challengeProgress(s, w.n).complete ? 'on' : ''}" title="Week ${w.n}"></i>`)}</div>
      </section>
      <div class="weeks mt-lg">
        ${PROGRAM.map((w) => {
          const r = weekRange(s, w.n);
          const ch = challengeProgress(s, w.n);
          const state = w.n === cur && !finished ? 'current' : w.n < cur || finished ? 'past' : 'future';
          const read = lessonDone(s, w.n);
          return html`<details class="week-card ${state} ${state === 'past' && !ch.complete ? 'partial' : ''}" ${w.n === cur ? 'open' : ''}>
            <summary>
              <span class="wk">${state === 'past' && ch.complete ? icon('check') : w.n}</span>
              <span class="grow"><b>${w.title}</b><span class="small muted" style="display:block">${w.habit} · ${fmtDate(r.start, { month: 'short', day: 'numeric' })}</span></span>
              ${ch.complete ? html`<span class="pill good">${icon('check')}Done</span>` : state === 'current' ? html`<span class="pill accent">This week</span>` : state === 'past' ? html`<span class="pill muted num" title="Challenge progress">${ch.done}/${ch.target}</span>` : ''}
            </summary>
            <div class="body">
              <div class="lesson">${w.lesson.map((p) => html`<p>${p}</p>`)}</div>
              <div><b>Try this</b><ul class="tips mt">${w.tips.map((t) => html`<li>${t}</li>`)}</ul></div>
              <div class="card tinted">
                <div class="row between"><b>Challenge</b><span class="small strong num">${ch.done}/${ch.target}</span></div>
                <p class="small muted">${ch.text}</p>
                <div class="bar mt"><i style="width:${Math.round((ch.done / ch.target) * 100)}%"></i></div>
              </div>
              ${state !== 'future'
                ? html`<form class="stack tight" data-form="reflect" data-week="${w.n}">
                    <label class="field"><span>Reflection: what will you do differently? (private)</span>
                    <textarea class="input" name="text" id="refl-${w.n}" maxlength="1000" placeholder="One sentence is enough.">${s.program.reflections?.[w.n] || ''}</textarea></label>
                    <div class="btn-row">
                      <button class="btn small secondary" type="submit">Save reflection</button>
                      ${read ? html`<span class="pill good">${icon('check')}Lesson read</span>` : html`<button class="btn small" type="button" data-action="lesson-done" data-week="${w.n}">${icon('check')}Mark lesson as read</button>`}
                    </div>
                  </form>`
                : html`<p class="hint">Unlocks ${fmtDate(r.start, { weekday: 'long', month: 'short', day: 'numeric' })}.</p>`}
            </div>
          </details>`;
        })}
      </div>`;
  },
  actions: {
    'lesson-done': (el) => {
      A.setLessonDone(Number(el.dataset.week), true);
      toast('Lesson marked as read.', { iconName: 'book' });
    },
  },
  forms: {
    reflect: (data, form) => {
      A.saveReflection(Number(form.dataset.week), data.text);
      toast('Reflection saved.');
    },
  },
};

export default plan;
