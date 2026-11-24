// Grades: every class with its average and status, upcoming tests, recent grades.
// Class detail: trend chart, all grades, tests and study time for one class.

import { html, todayISO, fmtNum, fmtDate, addDays, fmtMinutes, signed } from '../util.js';
import {
  activeClasses,
  overallAverage,
  overallTrend,
  classAverage,
  classTrend,
  classGrades,
  upcomingTests,
  classById,
  status,
  pct,
  GRADE_TYPES,
  WEIGHT_NOTE,
  weeklySeries,
} from '../logic/grades.js';
import { minutesBetween } from '../logic/stats.js';
import { lastStudied } from '../logic/planner.js';
import { icon } from '../ui/icons.js';
import { statusPill, trendPill, avgText, barFor, classDot, dateChip, whenText, emptyState } from '../ui/parts.js';
import { chart } from '../ui/charts.js';
import { confirmSheet, toast } from '../ui/dom.js';
import * as A from '../actions.js';
import { store } from '../state.js';

function gradeRow(s, g, { showClass = true } = {}) {
  const c = classById(s, g.classId);
  const p = pct(g);
  const st = status(p);
  return html`<button class="list-item" type="button" data-action="edit-grade" data-id="${g.id}">
    ${showClass ? classDot(c) : ''}
    <div class="li-main"><div class="li-title">${g.title}</div><div class="li-sub">${showClass && c ? `${c.name} · ` : ''}${GRADE_TYPES[g.type]?.label || 'Grade'} · ${fmtDate(g.date, { month: 'short', day: 'numeric' })}</div></div>
    <div class="li-end score">${Number(g.maxScore) !== 100 ? html`<span class="tiny muted num">${fmtNum(g.score, 1)}/${fmtNum(g.maxScore, 1)}</span>` : ''}<span class="pill ${st.tone} num" title="${st.label}">${fmtNum(p, 0)}%</span></div>
  </button>`;
}

function testsList(s, tests, today) {
  return html`<div class="list">${tests.map((t) => {
    const c = classById(s, t.classId);
    return html`<button class="list-item" type="button" data-action="edit-test" data-id="${t.id}">${dateChip(t.date, today)}
      <div class="li-main"><div class="li-title">${c ? c.name : 'Test'} · ${t.title}</div><div class="li-sub">${whenText(t.date, today)}${t.topics ? ` · ${t.topics}` : ''}</div></div>${icon('right')}</button>`;
  })}</div>`;
}

export default {
  title: 'Grades',
  render(s) {
    const today = todayISO();
    const classes = activeClasses(s);
    const avg = overallAverage(s);
    const goal = Number(s.profile.goalAverage) || 85;
    const tests = upcomingTests(s, today, 60);
    const recent = s.grades
      .filter((g) => !g.deleted && classes.some((c) => c.id === g.classId))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 8);
    return html`
      <div class="page-head">
        <div><h1>Grades</h1><p>Your averages update the moment you add a grade.</p></div>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="add-test">${icon('calendar')}Add test</button>
          <button class="btn" type="button" data-action="add-grade">${icon('plus')}Add grade</button>
        </div>
      </div>
      ${!classes.length
        ? html`<section class="card">${emptyState({ iconName: 'grades', title: 'No classes yet', body: 'Add the classes you are taking this semester.', action: html`<button class="btn" type="button" data-action="add-class">${icon('plus')}Add a class</button>` })}</section>`
        : html`
      <div class="cols">
        <div class="col">
        <section class="card" aria-labelledby="g-avg">
          <div class="card-head"><span class="eyebrow" id="g-avg">Current average</span>${trendPill(overallTrend(s, 30))}</div>
          <div class="big-num num">${avgText(avg)}<small>/ 100 · Goal ${goal}</small></div>
          <div class="mt">${barFor(avg, goal)}</div>
          <p class="hint mt">The average of your class averages. ${WEIGHT_NOTE}</p>
        </section>

        <section class="card" aria-labelledby="g-classes">
          <div class="card-head"><h2 id="g-classes">My classes</h2><span class="eyebrow">Status</span></div>
          <div class="list">
            ${classes.map((c) => {
              const a = classAverage(s, c.id);
              return html`<a class="class-row" href="#class-${c.id}">
                <div class="name">${classDot(c)}<span>${c.name}</span></div>
                <div class="val num">${avgText(a)} ${statusPill(a)}</div>
                ${barFor(a, c.target)}
              </a>`;
            })}
          </div>
          <div class="btn-row mt"><button class="btn small secondary" type="button" data-action="add-class">${icon('plus')}Add class</button></div>
        </section>
        </div>

        <div class="col">
        <section class="card" aria-labelledby="g-tests">
          <div class="card-head"><h2 id="g-tests">Upcoming tests</h2><button class="link-btn" type="button" data-action="add-test">${icon('plus')}Add</button></div>
          ${tests.length ? testsList(s, tests.slice(0, 5), today) : html`<p class="muted small">No upcoming tests. When a test is announced, add it here: your plan and reminders will get you ready.</p>`}
        </section>

        <section class="card" aria-labelledby="g-recent">
          <div class="card-head"><h2 id="g-recent">Recent grades</h2><span class="small muted">Tap one to edit</span></div>
          ${recent.length ? html`<div class="list">${recent.map((g) => gradeRow(s, g))}</div>` : html`<p class="muted small">No grades yet.</p>`}
        </section>
        </div>
      </div>`}`;
  },
};

export const classView = {
  title(s, route) {
    return classById(s, route.param)?.name || 'Class';
  },
  render(s, route) {
    const c = classById(s, route.param);
    if (!c || c.deleted) {
      return html`<section class="card">${emptyState({ iconName: 'grades', title: 'Class not found', body: 'It may have been deleted.', action: html`<a class="btn" href="#grades">Back to grades</a>` })}</section>`;
    }
    const today = todayISO();
    const a = classAverage(s, c.id);
    const tr = classTrend(s, c.id, 14, today);
    const grades = classGrades(s, c.id).slice().reverse();
    const tests = upcomingTests(s, today, 120).filter((t) => t.classId === c.id);
    const start = s.program.startDate;
    const series = weeklySeries(s, c.id, start, 10, today);
    const mins = minutesBetween(s, addDays(today, -27), today);
    const classMins = s.sessions.filter((x) => !x.deleted && x.classId === c.id && x.date >= addDays(today, -27)).reduce((t, x) => t + (x.minutes || 0), 0);
    const last = lastStudied(s, c.id);
    return html`
      <div class="page-head">
        <div>
          <a class="link-btn" href="#grades">${icon('left')}Grades</a>
          <h1 class="row" style="gap:10px">${classDot(c)}${c.name}</h1>
          <p>${c.teacher ? `${c.teacher} · ` : ''}Goal ${fmtNum(c.target, 0)}</p>
        </div>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="edit-class" data-id="${c.id}">${icon('edit')}Edit</button>
          <button class="btn" type="button" data-action="add-grade" data-class="${c.id}">${icon('plus')}Add grade</button>
        </div>
      </div>
      <div class="cols">
        <div class="col">
        <section class="card">
          <div class="card-head"><span class="eyebrow">Class average</span>${statusPill(a)}</div>
          <div class="big-num num">${avgText(a)}<small>Goal ${fmtNum(c.target, 0)}</small></div>
          <div class="mt">${barFor(a, c.target)}</div>
          <div class="row wrap mt">${trendPill(tr, 'in 2 weeks')}${a != null && a < c.target ? html`<span class="small muted">${fmtNum(c.target - a, 1)} points to your goal</span>` : a != null ? html`<span class="small muted">At or above your goal 🎯</span>` : ''}</div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Grades</h2><span class="small muted">${grades.length}</span></div>
          ${grades.length ? html`<div class="list">${grades.map((g) => gradeRow(s, g, { showClass: false }))}</div>` : html`<p class="muted small">No grades yet.</p>`}
        </section>
        </div>

        <div class="col">
        <section class="card">
          <div class="card-head"><h2>Average by program week</h2></div>
          ${chart({
            type: 'line',
            label: `${c.name} average by week`,
            x: series.map((p) => ({ label: `W${p.week}`, full: `Week ${p.week} (${fmtDate(p.date, { month: 'short', day: 'numeric' })})` })),
            series: [{ id: c.id, name: c.name, color: `var(--${c.color})`, cls: `c-${c.color}`, values: series.map((p) => (p.value == null ? null : Math.round(p.value * 10) / 10)) }],
            goal: { value: Number(c.target), label: `Goal ${fmtNum(c.target, 0)}` },
            yMax: 100,
            minSpan: 20,
            yFormat: (v) => fmtNum(v, 0),
            tipFormat: (v) => fmtNum(v, 1),
            height: 200,
            xTitle: 'Week',
            empty: 'Add grades to see your trend.',
          })}
        </section>

          <section class="card">
            <div class="card-head"><h2>Upcoming tests</h2><button class="link-btn" type="button" data-action="add-test" data-class="${c.id}">${icon('plus')}Add</button></div>
            ${tests.length ? testsList(s, tests, today) : html`<p class="muted small">None scheduled.</p>`}
          </section>
          <section class="card">
            <div class="card-head"><h2>Study time</h2></div>
            <p><b class="num">${fmtMinutes(classMins)}</b> <span class="muted">on ${c.name} in the last 4 weeks${mins ? ` (${Math.round((classMins / mins) * 100)}% of your study time)` : ''}.</span></p>
            <p class="small muted mt">${last ? `Last studied ${last === today ? 'today' : fmtDate(last, { weekday: 'long', month: 'short', day: 'numeric' })}.` : 'Not studied yet.'}</p>
            <div class="btn-row mt">
              <button class="btn small soft" type="button" data-action="start-timer" data-class="${c.id}" data-method="review" data-title="Study: ${c.name}">${icon('play')}Start a session</button>
              <a class="btn small secondary" href="#tutor" data-action="ask-tutor" data-class="${c.id}">${icon('tutor')}Ask the tutor</a>
            </div>
          </section>
          <section class="card flat">
            <div class="row between wrap"><div><b>Delete class</b><p class="small muted">Removes ${c.name} with its grades and tests.</p></div>
            <button class="btn small danger-ghost" type="button" data-action="delete-class" data-id="${c.id}">${icon('trash')}Delete</button></div>
          </section>
        </div>
      </div>`;
  },
  actions: {
    'delete-class': async (el, e, ctx) => {
      const c = classById(store.state, el.dataset.id);
      if (!c) return;
      const ok = await confirmSheet({ title: `Delete ${c.name}?`, body: 'Its grades and tests will be removed too. This cannot be undone.', confirm: 'Delete class', danger: true });
      if (!ok) return;
      A.deleteClass(c.id);
      ctx.go('#grades');
      toast(`${c.name} deleted.`);
    },
    'ask-tutor': (el, e, ctx) => {
      e.preventDefault();
      try {
        sessionStorage.setItem('sp:tutor-class', el.dataset.class || '');
      } catch {}
      ctx.go('#tutor');
    },
  },
};
