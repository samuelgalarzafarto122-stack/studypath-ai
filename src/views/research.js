// Research dashboard for the class project: anonymous totals only, from students who opted in.
// A "Simulated class" mode shows what the dashboard looks like with 24 made-up students.

import { html, fmtNum, signed, todayISO } from '../util.js';
import { aggregateResearch, simulatedSummaries, MIN_GROUP } from '../logic/research.js';
import { cloud } from '../cloud/index.js';
import { chart } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/dom.js';

let mode = 'simulated';
let real = null; // { status: 'loading'|'ready'|'error'|'unavailable', data, message }
let sim = null;

function simData() {
  if (!sim) sim = aggregateResearch(simulatedSummaries(24, 6), { source: 'simulated' });
  return sim;
}

async function loadReal(ctx) {
  real = { status: 'loading' };
  ctx.render();
  try {
    const res = await cloud.research();
    if (!res) real = { status: 'unavailable', message: cloud.researchHelp?.() || 'The research data is not available in this copy of the app.' };
    else real = { status: 'ready', data: res };
  } catch (e) {
    real = { status: 'error', message: e.message || 'Could not load the research data.' };
  }
  ctx.render();
}

function toCSV(d) {
  const rows = [['week', 'students', 'avg_grade', 'avg_minutes', 'avg_sessions', 'plan_followed_pct', 'avg_hints_per_problem', 'avg_tutor_messages', 'reminders_opened_pct', 'avg_mood', 'avg_confidence', 'avg_stress', 'challenge_completed_pct', 'lesson_read_pct']];
  for (const w of d.weeks) rows.push([w.week, w.n, w.avgGrade, w.avgMinutes, w.avgSessions, w.avgPlanPct, w.avgHints, w.avgTutorMsgs, w.openRate, w.avgMood, w.avgConfidence, w.avgStress, w.challengePct, w.lessonPct]);
  if (d.change) {
    rows.push([]);
    rows.push(['students_with_week1_and_now', 'avg_week1', 'avg_now', 'avg_change', 'raised_their_average_pct']);
    rows.push([d.change.n, d.change.avgStart, d.change.avgNow, d.change.avgDelta, d.change.improvedPct]);
    rows.push([]);
    rows.push(['weekly_study_time', 'students', 'avg_change']);
    for (const b of d.dose) rows.push([b.label, b.n, b.avgDelta]);
  }
  return rows.map((r) => r.map((v) => (v == null ? '' : v)).join(',')).join('\n') + '\n';
}

function dashboard(d) {
  if (d.tooFew) {
    return html`<section class="card"><div class="empty"><div class="ic">${icon('users')}</div><b>Not enough students yet</b>
      <p>${d.students} student${d.students === 1 ? '' : 's'} shared data so far. To protect privacy, totals appear once at least ${MIN_GROUP} students have joined.</p></div></section>`;
  }
  const xs = d.weeks.map((w) => ({ label: `W${w.week}`, full: `Week ${w.week} (${w.n} students)` }));
  const ch = d.change;
  return html`
    <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="stat"><div class="v num">${d.students}</div><div class="l">students sharing</div></div>
      <div class="stat"><div class="v num">${ch ? signed(ch.avgDelta, 1) : '–'}</div><div class="l">avg. grade change since week 1</div></div>
      <div class="stat"><div class="v num">${ch ? `${ch.improvedPct}%` : '–'}</div><div class="l">raised their average</div></div>
      <div class="stat"><div class="v num">${d.weeks.length ? fmtNum(d.weeks[d.weeks.length - 1].avgMinutes, 0) : '–'}</div><div class="l">min studied, latest week</div></div>
    </div>
    <div class="grid two mt-lg">
      <section class="card">
        <div class="card-head"><h2>Average grade by week</h2></div>
        ${chart({ type: 'line', label: 'Average grade of all participating students by program week', x: xs, series: [{ id: 'g', name: 'Average grade', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.avgGrade) }], minSpan: 10, ceil: 100, yFormat: (v) => fmtNum(v, 0), tipFormat: (v) => fmtNum(v, 1), xTitle: 'Week' })}
      </section>
      <section class="card">
        <div class="card-head"><h2>Grade change by study time</h2></div>
        <p class="small muted">Do students who study more improve more? Change in average from week 1 to now.</p>
        <div class="mt">
        ${d.dose.length
          ? chart({
              type: 'bar',
              label: 'Average grade change by weekly study time',
              x: d.dose.map((b) => ({ label: b.label.replace(' min/week', ''), full: `${b.label} (${b.n} students)` })),
              series: [{ id: 'dose', name: 'Grade change (points)', color: 'var(--s1)', cls: 'c-s1', values: d.dose.map((b) => b.avgDelta) }],
              yFormat: (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1),
              tipFormat: (v) => `${signed(v, 1)} points`,
              xTitle: 'Study time',
              height: 200,
              tipExtra: (i) => (d.dose[i].avgDelta == null ? `Hidden: fewer than ${MIN_GROUP} students` : `${d.dose[i].n} students`),
            })
          : html`<p class="muted small">Needs at least ${MIN_GROUP} students with two or more weeks of grades.</p>`}
        ${d.dose.some((b) => b.avgDelta == null) ? html`<p class="tiny muted mt">Groups with fewer than ${MIN_GROUP} students are hidden to protect privacy: ${d.dose.filter((b) => b.avgDelta == null).map((b) => b.label).join(', ')}.</p>` : ''}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Study minutes per week</h2></div>
        ${chart({ type: 'bar', label: 'Average minutes studied per program week', x: xs, series: [{ id: 'm', name: 'Average minutes', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.avgMinutes) }], unit: ' min', yFormat: (v) => fmtNum(v, 0), xTitle: 'Week', height: 200 })}
      </section>
      <section class="card">
        <div class="card-head"><h2>Tutor hints per solved problem</h2></div>
        <p class="small muted">Going down = students solve more on their own.</p>
        <div class="mt">${chart({ type: 'line', label: 'Average tutor hints per solved problem by week', x: xs, series: [{ id: 'h', name: 'Hints per problem', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.avgHints) }], yMin: 0, yFormat: (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1), tipFormat: (v) => fmtNum(v, 1), xTitle: 'Week', height: 190 })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>How students feel</h2></div>
        ${chart({
          type: 'line',
          label: 'Average weekly check-in scores from 1 to 5',
          x: xs,
          series: [
            { id: 'mood', name: 'Mood', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.avgMood) },
            { id: 'conf', name: 'Confidence', color: 'var(--s2)', cls: 'c-s2', values: d.weeks.map((w) => w.avgConfidence) },
            { id: 'stress', name: 'Stress', color: 'var(--s3)', cls: 'c-s3', values: d.weeks.map((w) => w.avgStress) },
          ],
          yMin: 1,
          yMax: 5,
          ticks: 4,
          yFormat: (v) => fmtNum(v, 0),
          tipFormat: (v) => `${fmtNum(v, 1)} of 5`,
          xTitle: 'Week',
          height: 200,
        })}
      </section>
      <section class="card">
        <div class="card-head"><h2>Study plan followed</h2></div>
        <p class="small muted">Share of planned study sessions that students finished.</p>
        <div class="mt">${chart({ type: 'bar', label: 'Average percent of planned study sessions completed, by week', x: xs, series: [{ id: 'p', name: 'Planned sessions done', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.avgPlanPct ?? null) }], yMin: 0, yMax: 100, unit: '%', yFormat: (v) => fmtNum(v, 0), xTitle: 'Week', height: 190, empty: 'No plan data yet.' })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Reminders opened</h2></div>
        <p class="small muted">Share of reminders students tapped. Shows if notifications actually help.</p>
        <div class="mt">${chart({ type: 'bar', label: 'Percent of reminders that were opened, by week', x: xs, series: [{ id: 'o', name: 'Reminders opened', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.openRate ?? null) }], yMin: 0, yMax: 100, unit: '%', yFormat: (v) => fmtNum(v, 0), xTitle: 'Week', height: 190, empty: 'Not enough reminders yet.' })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Weekly habit challenge</h2></div>
        ${chart({ type: 'bar', label: 'Percent of students who completed the weekly challenge', x: xs, series: [{ id: 'c', name: 'Completed the challenge', color: 'var(--s1)', cls: 'c-s1', values: d.weeks.map((w) => w.challengePct) }], yMin: 0, yMax: 100, unit: '%', yFormat: (v) => fmtNum(v, 0), xTitle: 'Week', height: 190 })}
      </section>
    </div>`;
}

export default {
  title: 'Research dashboard',
  render(s, route, ctx) {
    const d = mode === 'simulated' ? simData() : real?.status === 'ready' ? real.data : null;
    return html`
      <div class="page-head">
        <div><a class="link-btn" href="#progress">${icon('left')}Progress</a><h1>Research dashboard</h1><p>Does the program help? Anonymous totals from students who chose to share. No names, no individual records.</p></div>
        <div class="seg" role="group" aria-label="Data source">
          <button type="button" data-action="r-mode" data-mode="real" aria-pressed="${mode === 'real' ? 'true' : 'false'}">Real data</button>
          <button type="button" data-action="r-mode" data-mode="simulated" aria-pressed="${mode === 'simulated' ? 'true' : 'false'}">Simulated class</button>
        </div>
      </div>
      ${mode === 'simulated'
        ? html`<div class="notice warn">${icon('info')}<span><b>Simulated data:</b> 24 made-up students in week 6, to show how the dashboard works. Switch to “Real data” to see students who opted in.</span></div>`
        : real?.status === 'loading' || !real
          ? html`<div class="notice"><span class="spinner" aria-hidden="true"></span><span>Loading anonymous totals…</span></div>`
          : real.status !== 'ready'
            ? html`<div class="notice ${real.status === 'error' ? 'bad' : ''}">${icon(real.status === 'error' ? 'alert' : 'info')}<span>${real.message}</span></div>`
            : html`<div class="notice good">${icon('shield')}<span>Real, anonymous data from ${real.data.students} student${real.data.students === 1 ? '' : 's'}. Weeks with fewer than ${MIN_GROUP} students are hidden.</span></div>`}
      <div class="mt-lg">${d ? dashboard(d) : ''}</div>
      <div class="grid two mt-lg">
        <section class="card tinted">
          <div class="card-head"><h3>How this answers the driving question</h3></div>
          <ul class="tips small">
            <li><b>Understand the material:</b> fewer tutor hints per solved problem over the weeks.</li>
            <li><b>Better study habits:</b> more minutes per week, more of the plan followed, more weekly challenges completed, reminders that get opened.</li>
            <li><b>Better performance:</b> grade change since week 1, and whether more study means more improvement.</li>
            <li><b>Privacy:</b> opt-in only, no names, totals only, small groups hidden.</li>
          </ul>
        </section>
        <section class="card tinted">
          <div class="card-head"><h3>What is shared, exactly</h3></div>
          <p class="small muted">For each week: the student's overall average, minutes and sessions studied, share of the plan finished, problems solved and hints used, how many tutor messages and reminders (counts only), check-in scores (1–5), and whether the weekly challenge and lesson were done. Plus grade level (9–12). Never names, class names, notes or what anyone typed.</p>
          ${d && !d.tooFew ? html`<div class="btn-row mt"><button class="btn small secondary" type="button" data-action="r-csv">${icon('download')}Download totals (CSV)</button></div>` : ''}
        </section>
      </div>`;
  },
  mounted(root, s, route, ctx) {
    if (mode === 'real' && !real) loadReal(ctx);
  },
  actions: {
    'r-mode': (el, e, ctx) => {
      mode = el.dataset.mode;
      if (mode === 'real' && (!real || real.status === 'error')) loadReal(ctx);
      else ctx.render();
    },
    'r-csv': () => {
      const d = mode === 'simulated' ? simData() : real?.data;
      if (!d) return;
      const text = toCSV(d);
      if (cloud.saveFile) return cloud.saveFile(`studypath-research-${mode}-${todayISO()}.csv`, text, 'text/csv');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = `studypath-research-${mode}-${todayISO()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Downloaded.');
    },
  },
};
