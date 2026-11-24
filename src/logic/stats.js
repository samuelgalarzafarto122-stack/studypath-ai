// Study statistics computed from the session log, tutor log and check-ins.

import { addDays, daysBetween, startOfWeekISO, todayISO, mean, sum, localDateOf } from '../util.js';

/** Local date a tutor conversation happened. */
export const tutorDate = (t) => t.date || (t.startedAt ? localDateOf(t.startedAt) : null);

export const doneSessions = (state) => state.sessions.filter((s) => !s.deleted && s.date);

/** Consecutive days with at least one finished session, ending today (or yesterday if today has none yet). */
export function streak(state, today = todayISO()) {
  const days = new Set(doneSessions(state).map((s) => s.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function studiedToday(state, today = todayISO()) {
  return doneSessions(state).some((s) => s.date === today);
}

export function minutesOn(state, date) {
  return sum(doneSessions(state).filter((s) => s.date === date).map((s) => s.minutes || 0));
}

export function minutesBetween(state, start, end) {
  return sum(
    doneSessions(state)
      .filter((s) => s.date >= start && s.date <= end)
      .map((s) => s.minutes || 0),
  );
}

export function minutesThisWeek(state, today = todayISO()) {
  return minutesBetween(state, startOfWeekISO(today), today);
}

/** Minutes per program week, from the program start up to the current week. */
export function weeklyMinutes(state, today = todayISO(), weeks = 10) {
  const start = state.program.startDate;
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const s = addDays(start, w * 7);
    if (s > today) break;
    const e = addDays(s, 6);
    out.push({ week: w + 1, start: s, end: e, minutes: minutesBetween(state, s, e) });
  }
  return out;
}

export function totalMinutes(state) {
  return sum(doneSessions(state).map((s) => s.minutes || 0));
}

export function tutorStats(state) {
  const t = state.tutor.filter((x) => !x.deleted);
  const problems = t.filter((x) => x.kind === 'problem');
  const solved = problems.filter((x) => x.solved);
  return {
    conversations: t.length,
    problems: problems.length,
    solved: solved.length,
    independent: solved.filter((x) => (x.hintsUsed ?? 0) <= 2).length,
    avgHints: solved.length ? mean(solved.map((x) => x.hintsUsed || 0)) : null,
  };
}

/** Average hints per solved problem, per program week (lower over time = more independent). */
export function hintsByWeek(state) {
  const start = state.program.startDate;
  const byWeek = new Map();
  for (const t of state.tutor) {
    const d = tutorDate(t);
    if (t.deleted || t.kind !== 'problem' || !t.solved || !d) continue;
    const w = Math.floor(daysBetween(start, d) / 7) + 1;
    if (w < 1) continue;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(t.hintsUsed || 0);
  }
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, hs]) => ({ week, avg: mean(hs), n: hs.length }));
}

export function checkinSeries(state) {
  return state.checkins
    .filter((c) => !c.deleted)
    .sort((a, b) => (a.week || 0) - (b.week || 0) || String(a.date).localeCompare(String(b.date)));
}

export function checkinThisWeek(state, week) {
  return state.checkins.find((c) => !c.deleted && c.week === week) || null;
}
