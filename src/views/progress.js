// Progress: grades over time, study time, tutor independence, check-ins and plain-language insights.

import { html, todayISO, fmtNum, fmtDate, fmtMinutes, addDays, signed } from '../util.js';
import { activeClasses, overallAverage, weeklySeries, classAverage } from '../logic/grades.js';
import { weeklyMinutes, tutorStats, hintsByWeek, checkinSeries, streak, totalMinutes } from '../logic/stats.js';
import { computeInsights } from '../logic/insights.js';
import { PROGRAM, currentWeek, challengeProgress } from '../logic/program.js';
import { chart } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { openSheet, toast } from '../ui/dom.js';
import { insightList } from './today.js';
import { store } from '../state.js';

const fmtHours = (min) => {
  const m = Math.round(min || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};

function weeksUntilNow(s) {
  return Math.max(1, Math.min(10, currentWeek(s)));
}

export function progressSummary(s) {
  const today = todayISO();
  const start = s.program.startDate;
  const startAvg = overallAverage(s, { until: addDays(start, 6) });
  const nowAvg = overallAverage(s);
  const ts = tutorStats(s);
  const weeks = weeklyMinutes(s, today);
  const lines = [
    `StudyPath progress summary${s.profile.nickname ? ` for ${s.profile.nickname}` : ''} (week ${currentWeek(s)} of 10, ${fmtDate(today, { month: 'long', day: 'numeric', year: 'numeric' })})`,
    '',
    `Overall average: ${nowAvg == null ? 'no grades yet' : fmtNum(nowAvg, 1)}${startAvg != null && nowAvg != null ? ` (week 1: ${fmtNum(startAvg, 1)}, change ${signed(nowAvg - startAvg, 1)})` : ''}`,
    ...activeClasses(s).map((c) => {
      const a = classAverage(s, c.id);
      return `- ${c.name}: ${a == null ? 'no grades' : fmtNum(a, 1)} (goal ${fmtNum(c.target, 0)})`;
    }),
    '',
    `Study time: ${fmtMinutes(totalMinutes(s))} total, ${fmtMinutes(weeks.length ? weeks[weeks.length - 1].minutes : 0)} this week. Current streak: ${streak(s)} days.`,
    `Tutor: ${ts.solved} of ${ts.problems} problems solved${ts.avgHints != null ? `, ${fmtNum(ts.avgHints, 1)} hints per problem on average` : ''}.`,
    `Program challenges completed: ${PROGRAM.filter((w) => w.n <= currentWeek(s) && challengeProgress(s, w.n).complete).length} of ${currentWeek(s)}.`,
  ];
  return lines.join('\n');
}

export default {
  title: 'Progress',
  render(s) {
    const today = todayISO();
    const classes = activeClasses(s);
    const start = s.program.startDate;
    const nW = weeksUntilNow(s);
    const overall = weeklySeries(s, null, start, nW, today);
    const byClass = classes.map((c) => ({ c, pts: weeklySeries(s, c.id, start, nW, today) }));
    const xs = overall.map((p) => ({ label: `W${p.week}`, full: `Week ${p.week} · ${fmtDate(p.date, { month: 'short', day: 'numeric' })}` }));
    const mins = weeklyMinutes(s, today);
    const goalWeek = (Number(s.settings.dailyMinutes) || 50) * (s.settings.studyDays?.length || 5);
    const hints = hintsByWeek(s);
    const hintWeeks = Array.from({ length: nW }, (_, i) => i + 1);
    const checks = checkinSeries(s);
    const checkWeeks = Array.from({ length: nW }, (_, i) => i + 1);
    const byWeek = (w, key) => {
      const c = checks.find((x) => x.week === w);
      return c ? c[key] : null;
    };
    const ts = tutorStats(s);
    const lastCheck = checks.length ? checks[checks.length - 1] : null;
    const insights = computeInsights(s);
    const goal = Number(s.profile.goalAverage) || 85;
    return html`
      <div class="page-head">
        <div><h1>Progress</h1><p>Your own learning data, in plain language. It helps you see what's working.</p></div>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="share-summary">${icon('share')}Progress summary</button>
          <button class="btn" type="button" data-action="checkin">${icon('smile')}Weekly check-in</button>
        </div>
      </div>
      <div class="grid two">
        <section class="card span-2">
          <div class="card-head"><h2>What your data says</h2></div>
          ${insights.length ? insightList(insights) : html`<p class="muted">Keep adding grades and logging study sessions. After a couple of weeks StudyPath will point out patterns, like which study habits raise your grades.</p>`}
        </section>

        <section class="card">
          <div class="card-head"><h2>Overall average by week</h2></div>
          ${chart({
            type: 'line',
            label: 'Overall average by program week',
            x: xs,
            series: [{ id: 'overall', name: 'Overall average', color: 'var(--s1)', cls: 'c-s1', values: overall.map((p) => (p.value == null ? null : Math.round(p.value * 10) / 10)) }],
            goal: { value: goal, label: `Goal ${goal}` },
            yMax: 100,
            minSpan: 20,
            yFormat: (v) => fmtNum(v, 0),
            tipFormat: (v) => fmtNum(v, 1),
            xTitle: 'Week',
            empty: 'Add grades to see your average over time.',
          })}
        </section>

        <section class="card">
          <div class="card-head"><h2>Classes by week</h2></div>
          ${chart({
            type: 'line',
            label: 'Class averages by program week',
            x: xs,
            series: byClass.map(({ c, pts }) => ({ id: c.id, name: c.name, color: `var(--${c.color})`, cls: `c-${c.color}`, values: pts.map((p) => (p.value == null ? null : Math.round(p.value * 10) / 10)) })),
            yMax: 100,
            minSpan: 20,
            yFormat: (v) => fmtNum(v, 0),
            tipFormat: (v) => fmtNum(v, 1),
            xTitle: 'Week',
            empty: 'Add grades to see each class over time.',
          })}
        </section>

        <section class="card">
          <div class="card-head"><h2>Study time per week</h2></div>
          ${chart({
            type: 'bar',
            label: 'Time studied per program week',
            x: mins.map((w) => ({ label: `W${w.week}`, full: `Week ${w.week} · ${fmtDate(w.start, { month: 'short', day: 'numeric' })}–${fmtDate(w.end, { month: 'short', day: 'numeric' })}` })),
            series: [{ id: 'min', name: 'Time studied', color: 'var(--s1)', cls: 'c-s1', values: mins.map((w) => w.minutes) }],
            goal: { value: goalWeek, label: `Goal ${fmtMinutes(goalWeek)} a week` },
            unitStep: 60,
            ticks: 5,
            yFormat: (v) => (v === 0 ? '0' : `${fmtNum(v / 60, v % 60 ? 1 : 0)}h`),
            tipFormat: (v) => fmtMinutes(v),
            partialLast: true,
            tipExtra: (i) => (i === mins.length - 1 ? 'This week so far' : ''),
            xTitle: 'Week',
            height: 190,
            empty: 'Finish a study session to start this chart.',
          })}
          <div class="stats mt">
            <div class="stat"><div class="v num">${fmtHours(totalMinutes(s))}</div><div class="l">total studied</div></div>
            <div class="stat"><div class="v num">${fmtHours(mins.length ? mins[mins.length - 1].minutes : 0)}</div><div class="l">this week so far</div></div>
            <div class="stat"><div class="v num">${streak(s)}</div><div class="l">day streak</div></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Tutor: hints per solved problem</h2></div>
          <p class="small muted">Fewer hints over time means you're solving more on your own.</p>
          <div class="mt">
          ${chart({
            type: 'bar',
            label: 'Average hints per solved problem, by week',
            x: hintWeeks.map((w) => ({ label: `W${w}`, full: `Week ${w}` })),
            series: [{ id: 'hints', name: 'Hints per problem', color: 'var(--s1)', cls: 'c-s1', values: hintWeeks.map((w) => {
              const h = hints.find((x) => x.week === w);
              return h ? Math.round(h.avg * 10) / 10 : null;
            }) }],
            yMin: 0,
            yMax: 4,
            ticks: 4,
            yFormat: (v) => fmtNum(v, 1),
            tipExtra: (i) => {
              const h = hints.find((x) => x.week === i + 1);
              return h ? `${h.n} problem${h.n === 1 ? '' : 's'} solved` : 'No solved problems';
            },
            xTitle: 'Week',
            height: 190,
            empty: 'Solve a problem with the tutor to start this chart.',
          })}
          </div>
          <div class="stats mt">
            <div class="stat"><div class="v num">${ts.solved}</div><div class="l">problems solved</div></div>
            <div class="stat"><div class="v num">${ts.solved ? Math.round((ts.independent / ts.solved) * 100) : 0}%</div><div class="l">with ≤2 hints</div></div>
            <div class="stat"><div class="v num">${ts.avgHints == null ? '–' : fmtNum(ts.avgHints, 1)}</div><div class="l">avg hints</div></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Weekly check-ins</h2><button class="link-btn" type="button" data-action="checkin">${icon('plus')}Check in</button></div>
          ${chart({
            type: 'line',
            label: 'Weekly check-ins: mood, confidence and stress from 1 to 5',
            x: checkWeeks.map((w) => ({ label: `W${w}`, full: `Week ${w}` })),
            series: [
              { id: 'mood', name: 'Mood', color: 'var(--s1)', cls: 'c-s1', values: checkWeeks.map((w) => byWeek(w, 'mood')) },
              { id: 'confidence', name: 'Confidence', color: 'var(--s2)', cls: 'c-s2', values: checkWeeks.map((w) => byWeek(w, 'confidence')) },
              { id: 'stress', name: 'Stress', color: 'var(--s3)', cls: 'c-s3', values: checkWeeks.map((w) => byWeek(w, 'stress')) },
            ],
            yMin: 1,
            yMax: 5,
            ticks: 4,
            yFormat: (v) => fmtNum(v, 0),
            tipFormat: (v) => `${fmtNum(v, 0)} of 5`,
            xTitle: 'Week',
            height: 190,
            empty: 'Do your first weekly check-in to see how you feel over time.',
          })}
          ${lastCheck
            ? html`<div class="stats mt">
                <div class="stat"><div class="v num">${lastCheck.mood}<small>/5</small></div><div class="l">mood (week ${lastCheck.week})</div></div>
                <div class="stat"><div class="v num">${lastCheck.confidence}<small>/5</small></div><div class="l">confidence</div></div>
                <div class="stat"><div class="v num">${lastCheck.stress}<small>/5</small></div><div class="l">stress</div></div>
              </div>
              ${lastCheck.stress >= 4 ? html`<p class="small muted mt">Stress has been high. Talking to a school counselor, teacher or someone you trust can really help.</p>` : ''}`
            : ''}
        </section>

        <section class="card">
          <div class="card-head"><h2>Program challenges</h2><a class="link-btn" href="#program">Program ${icon('right')}</a></div>
          <div class="list">
            ${PROGRAM.filter((w) => w.n <= currentWeek(s)).reverse().map((w) => {
              const ch = challengeProgress(s, w.n);
              return html`<div class="list-item"><span class="wk pill ${ch.complete ? 'good' : ''}">W${w.n}</span><div class="li-main"><div class="li-title">${w.habit}</div><div class="li-sub">${ch.text}</div></div><span class="small strong num">${ch.done}/${ch.target}</span></div>`;
            })}
          </div>
        </section>

        <section class="card span-2 tinted">
          <div class="row between wrap">
            <div class="row top"><span class="brand-mark" aria-hidden="true">${icon('users')}</span><div><b>Research dashboard</b><p class="small muted">For the class project: anonymous totals from every student who chose to share, to see if the program works.</p></div></div>
            <a class="btn small secondary" href="#research">Open dashboard</a>
          </div>
        </section>
      </div>`;
  },
  actions: {
    'share-summary': () => {
      const text = progressSummary(store.state);
      openSheet({
        title: 'Progress summary',
        body: html`<p class="small muted">Share it with a teacher, parent or tutor if you want to. It's not sent anywhere unless you copy and send it yourself.</p>
          <textarea class="input mt" id="summary-text" rows="12" readonly style="font-size:14px">${text}</textarea>`,
        foot: html`<button class="btn secondary" type="button" data-close>Close</button><button class="btn" type="button" data-sheet-action="copy">${icon('copy')}Copy</button>`,
        actions: {
          copy: async (el) => {
            try {
              await navigator.clipboard.writeText(text);
              toast('Copied. Paste it into a message or email.');
            } catch {
              const ta = document.getElementById('summary-text');
              ta?.select();
              toast('Select the text and copy it.', { iconName: 'info' });
            }
          },
        },
      });
    },
  },
};
