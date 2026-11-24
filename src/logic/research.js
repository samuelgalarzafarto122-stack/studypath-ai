// Research data for the class project ("does the program work?").
// Each student who opts in shares ONE small anonymous summary: weekly numbers only, no names,
// no class names, no free text, no tutor messages. The dashboard only shows totals, and any
// week with fewer than MIN_GROUP students is hidden (k-anonymity), so no one can be singled out.

import { addDays, mean, round1, todayISO } from '../util.js';
import { overallAverage } from './grades.js';
import { minutesBetween, tutorDate } from './stats.js';
import { PROGRAM_WEEKS, currentWeek, weekRange, challengeProgress, lessonDone } from './program.js';

export const MIN_GROUP = 5;
export const SUMMARY_VERSION = 2;

/** The only thing that leaves a student's device for research. */
export function researchSummary(state, today = todayISO()) {
  const nowWeek = currentWeek(state, today);
  const weeks = [];
  for (let n = 1; n <= Math.min(nowWeek, PROGRAM_WEEKS); n++) {
    const r = weekRange(state, n);
    const end = r.end > today ? today : r.end;
    const avg = overallAverage(state, { until: end });
    const solved = state.tutor.filter((t) => !t.deleted && t.kind === 'problem' && t.solved && tutorDate(t) >= r.start && tutorDate(t) <= r.end);
    const ck = state.checkins.find((c) => !c.deleted && c.week === n);
    const ev = (state.events || []).filter((e) => e.date >= r.start && e.date <= r.end);
    let planned = 0;
    let planDone = 0;
    for (let d = r.start; d <= end; d = addDays(d, 1)) {
      const p = state.plans?.[d];
      if (!p?.sessions?.length) continue;
      planned += p.sessions.length;
      planDone += p.sessions.filter((x) => x.done).length;
    }
    weeks.push({
      week: n,
      avg: avg == null ? null : round1(avg),
      minutes: minutesBetween(state, r.start, end),
      sessions: state.sessions.filter((x) => !x.deleted && x.date >= r.start && x.date <= end).length,
      planPct: planned ? Math.round((planDone / planned) * 100) : null,
      solved: solved.length,
      hints: solved.length ? round1(mean(solved.map((t) => t.hintsUsed || 0))) : null,
      tutorMsgs: ev.filter((e) => e.type === 'tutor_message').length,
      reminders: ev.filter((e) => e.type === 'reminder_shown').length,
      opened: ev.filter((e) => e.type === 'reminder_opened').length,
      mood: ck ? ck.mood : null,
      confidence: ck ? ck.confidence : null,
      stress: ck ? ck.stress : null,
      challenge: challengeProgress(state, n).complete ? 1 : 0,
      lesson: lessonDone(state, n) ? 1 : 0,
    });
  }
  const withAvg = weeks.filter((w) => w.avg != null);
  return {
    v: SUMMARY_VERSION,
    week: nowWeek,
    gradeLevel: String(state.profile.gradeLevel || ''),
    startAvg: withAvg.length ? withAvg[0].avg : null,
    nowAvg: withAvg.length ? withAvg[withAvg.length - 1].avg : null,
    avgWeeklyMinutes: weeks.length ? Math.round(mean(weeks.map((w) => w.minutes))) : 0,
    weeks,
    updated: today,
  };
}

const avgOf = (arr) => {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  return v.length ? round1(mean(v)) : null;
};
const pctOf = (rows, key) => Math.round((rows.filter((r) => r[key]).length / rows.length) * 100);
const sumOf = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);

export const DOSE_BANDS = [
  { key: 'low', label: 'Under 60 min/week', min: 0, max: 60 },
  { key: 'mid', label: '60–119 min/week', min: 60, max: 120 },
  { key: 'high', label: '120+ min/week', min: 120, max: Infinity },
];

/** Totals for the dashboard. Hides any group smaller than MIN_GROUP. */
export function aggregateResearch(summaries, { source = 'cloud' } = {}) {
  const list = (summaries || []).filter((s) => s && Array.isArray(s.weeks));
  const out = { source, students: list.length, tooFew: list.length < MIN_GROUP, weeks: [], dose: [], change: null, generatedAt: new Date().toISOString() };
  if (out.tooFew) return out;
  for (let n = 1; n <= PROGRAM_WEEKS; n++) {
    const rows = list.map((s) => s.weeks.find((w) => w.week === n)).filter(Boolean);
    if (rows.length < MIN_GROUP) continue;
    out.weeks.push({
      week: n,
      n: rows.length,
      avgGrade: avgOf(rows.map((r) => r.avg)),
      avgMinutes: avgOf(rows.map((r) => r.minutes)),
      avgHints: avgOf(rows.map((r) => r.hints)),
      avgMood: avgOf(rows.map((r) => r.mood)),
      avgConfidence: avgOf(rows.map((r) => r.confidence)),
      avgStress: avgOf(rows.map((r) => r.stress)),
      challengePct: pctOf(rows, 'challenge'),
      avgSessions: avgOf(rows.map((r) => r.sessions)),
      avgPlanPct: avgOf(rows.map((r) => r.planPct)),
      avgTutorMsgs: avgOf(rows.map((r) => r.tutorMsgs)),
      lessonPct: pctOf(rows, 'lesson'),
      // share of reminders that were opened (only when enough reminders were sent to mean something)
      openRate: sumOf(rows, 'reminders') >= 10 ? Math.round((sumOf(rows, 'opened') / sumOf(rows, 'reminders')) * 100) : null,
    });
  }
  const paired = list.filter((s) => s.startAvg != null && s.nowAvg != null && s.weeks.length >= 2);
  if (paired.length >= MIN_GROUP) {
    const deltas = paired.map((s) => s.nowAvg - s.startAvg);
    out.change = {
      n: paired.length,
      avgStart: avgOf(paired.map((s) => s.startAvg)),
      avgNow: avgOf(paired.map((s) => s.nowAvg)),
      avgDelta: avgOf(deltas),
      improvedPct: Math.round((deltas.filter((d) => d > 0).length / deltas.length) * 100),
    };
    for (const b of DOSE_BANDS) {
      const group = paired.filter((s) => s.avgWeeklyMinutes >= b.min && s.avgWeeklyMinutes < b.max);
      out.dose.push({ key: b.key, label: b.label, n: group.length, avgDelta: group.length >= MIN_GROUP ? avgOf(group.map((s) => s.nowAvg - s.startAvg)) : null });
    }
  }
  return out;
}

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A made-up class for presentations, clearly labeled "Simulated". Students who study more improve
 * more on average, with lots of noise, like real data.
 */
export function simulatedSummaries(count = 24, weeksDone = 6, seed = 42) {
  const r = rng(seed);
  const gauss = () => (r() + r() + r() + r() - 2) * 1.2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const habit = r(); // 0..1 how much this student engages
    const start = 64 + r() * 18;
    const baseMin = 25 + habit * 150;
    let avg = start;
    let hints = 3.4 - habit * 0.6;
    const weeks = [];
    for (let n = 1; n <= weeksDone; n++) {
      const minutes = Math.max(0, Math.round(baseMin * (0.7 + n * 0.06) + gauss() * 18));
      avg += (minutes - 60) / 160 + gauss() * 0.6;
      avg = Math.max(45, Math.min(99, avg));
      hints = Math.max(0.4, hints - 0.25 * habit - 0.05 + gauss() * 0.15);
      const solved = Math.max(0, Math.round(habit * 4 + gauss()));
      const ck = r() < 0.8;
      const reminders = Math.max(0, Math.round(6 + gauss() * 2));
      weeks.push({
        week: n,
        avg: round1(avg),
        minutes,
        sessions: Math.max(0, Math.round(minutes / 25 + gauss() * 0.5)),
        planPct: Math.max(0, Math.min(100, Math.round(30 + habit * 55 + n * 2 + gauss() * 10))),
        solved,
        hints: solved ? round1(hints) : null,
        tutorMsgs: Math.max(0, Math.round(solved * 4 + habit * 6 + gauss() * 2)),
        reminders,
        opened: Math.max(0, Math.min(reminders, Math.round(reminders * (0.25 + habit * 0.45) + gauss()))),
        lesson: r() < 0.4 + habit * 0.5 ? 1 : 0,
        mood: ck ? Math.max(1, Math.min(5, Math.round(3 + habit + gauss() * 0.6))) : null,
        confidence: ck ? Math.max(1, Math.min(5, Math.round(2 + habit * 1.2 + n * 0.15 + gauss() * 0.5))) : null,
        stress: ck ? Math.max(1, Math.min(5, Math.round(3.6 - habit * 0.8 - n * 0.08 + gauss() * 0.6))) : null,
        challenge: r() < 0.35 + habit * 0.55 ? 1 : 0,
      });
    }
    out.push({
      v: SUMMARY_VERSION,
      week: weeksDone,
      gradeLevel: String(9 + Math.floor(r() * 4)),
      startAvg: weeks[0].avg,
      nowAvg: weeks[weeks.length - 1].avg,
      avgWeeklyMinutes: Math.round(mean(weeks.map((w) => w.minutes))),
      weeks,
      updated: addDays(todayISO(), -Math.floor(r() * 3)),
    });
  }
  return out;
}
