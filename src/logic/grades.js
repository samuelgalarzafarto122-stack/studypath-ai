// Grade math: averages, status, trends and grade-drop detection.
// Averages are weighted by assignment type so one homework does not count like a test.

import { mean, addDays, todayISO, daysBetween } from '../util.js';

export const GRADE_TYPES = {
  test: { label: 'Test', weight: 3 },
  quiz: { label: 'Quiz', weight: 2 },
  project: { label: 'Project', weight: 2 },
  homework: { label: 'Homework', weight: 1 },
  classwork: { label: 'Classwork', weight: 1 },
  start: { label: 'Starting grade', weight: 3 },
};

export const WEIGHT_NOTE = 'Tests count 3×, quizzes and projects 2×, homework and classwork 1×.';

/** Categorical chart slots, assigned to classes in order and kept for the life of the class. */
export const CLASS_COLORS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

export const pct = (g) => (g && g.maxScore > 0 ? (Number(g.score) / Number(g.maxScore)) * 100 : 0);

export function activeClasses(state) {
  return state.classes
    .filter((c) => !c.deleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function nextClassColor(state) {
  const used = new Set(activeClasses(state).map((c) => c.color));
  return CLASS_COLORS.find((c) => !used.has(c)) || CLASS_COLORS[activeClasses(state).length % CLASS_COLORS.length];
}

export function classGrades(state, classId, { until } = {}) {
  return state.grades
    .filter((g) => !g.deleted && g.classId === classId && (!until || g.date <= until))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function weightedAverage(grades) {
  let w = 0;
  let s = 0;
  for (const g of grades) {
    const wt = GRADE_TYPES[g.type]?.weight ?? 1;
    w += wt;
    s += wt * pct(g);
  }
  return w ? s / w : null;
}

export function classAverage(state, classId, opts) {
  return weightedAverage(classGrades(state, classId, opts));
}

export function overallAverage(state, opts) {
  const avgs = activeClasses(state)
    .map((c) => classAverage(state, c.id, opts))
    .filter((v) => v != null);
  return avgs.length ? mean(avgs) : null;
}

export function status(avg) {
  if (avg == null) return { key: 'none', label: 'No grades yet', tone: 'muted' };
  if (avg < 70) return { key: 'help', label: 'Needs help', tone: 'bad' };
  if (avg < 80) return { key: 'watch', label: 'Watch', tone: 'warn' };
  return { key: 'track', label: 'On track', tone: 'good' };
}

const STATUS_RANK = { help: 0, watch: 1, track: 2, none: 3 };

/** Change in a class average over the last `days` days (null when there is no earlier grade). */
export function classTrend(state, classId, days = 30, today = todayISO()) {
  const now = classAverage(state, classId);
  const then = classAverage(state, classId, { until: addDays(today, -days) });
  if (now == null || then == null) return null;
  return now - then;
}

export function overallTrend(state, days = 30, today = todayISO()) {
  const now = overallAverage(state);
  const then = overallAverage(state, { until: addDays(today, -days) });
  if (now == null || then == null) return null;
  return now - then;
}

/**
 * What a new grade would do to its class. Call it BEFORE saving the grade.
 * Returns { before, after, delta, isDrop, lowScore, statusDown, message }.
 */
export function gradeImpact(state, grade) {
  const existing = classGrades(state, grade.classId);
  const before = weightedAverage(existing);
  const after = weightedAverage([...existing, grade]);
  const delta = before == null ? null : after - before;
  const score = pct(grade);
  const sb = status(before);
  const sa = status(after);
  const statusDown = before != null && STATUS_RANK[sa.key] < STATUS_RANK[sb.key];
  const isDrop = delta != null && (delta <= -2 || statusDown);
  const lowScore = score < 70;
  return { before, after, delta, score, isDrop, lowScore, statusDown, statusBefore: sb, statusAfter: sa };
}

/**
 * Weekly points for charts: the average at the end of each week, from startISO for `weeks` weeks,
 * stopping at today. classId = null gives the overall average.
 */
export function weeklySeries(state, classId, startISO, weeks, today = todayISO()) {
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const end = addDays(startISO, w * 7 + 6);
    const until = end > today ? today : end;
    if (daysBetween(startISO, until) < w * 7) break;
    const value = classId ? classAverage(state, classId, { until }) : overallAverage(state, { until });
    out.push({ week: w + 1, date: until, value });
    if (end >= today) break;
  }
  return out;
}

export function upcomingTests(state, today = todayISO(), days = 60) {
  return state.tests
    .filter((t) => !t.deleted && t.date >= today && daysBetween(today, t.date) <= days)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nextTestFor(state, classId, today = todayISO()) {
  return upcomingTests(state, today).find((t) => t.classId === classId) || null;
}

export function classById(state, id) {
  return state.classes.find((c) => c.id === id) || null;
}
