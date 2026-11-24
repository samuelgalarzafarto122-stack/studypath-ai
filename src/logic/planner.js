// The study planner. It ranks classes by need (gap to goal, closeness of the next test, recent
// drops, time since last studied) and turns the student's daily study minutes into short sessions,
// with a plain-language "why" so the plan is never a black box.

import { activeClasses, classAverage, classTrend, nextTestFor, classGrades, pct } from './grades.js';
import { currentWeek, weekInfo } from './program.js';
import { addMinutesHHMM, daysBetween, weekday, uid, hashOf, fmtNum, addDays } from '../util.js';

export const METHODS = {
  review: { label: 'Review + practice', short: 'Review' },
  practice: { label: 'Timed practice test', short: 'Practice test' },
  recall: { label: 'Active recall', short: 'Recall' },
  flashcards: { label: 'Flashcards', short: 'Flashcards' },
  mistakes: { label: 'Fix mistakes', short: 'Mistakes' },
  teach: { label: 'Teach it back', short: 'Teach-back' },
  tutor: { label: 'Tutor session', short: 'Tutor' },
  custom: { label: 'Study session', short: 'Study' },
};

export function lastStudied(state, classId) {
  let last = null;
  for (const s of state.sessions) {
    if (!s.deleted && s.classId === classId && s.date && (!last || s.date > last)) last = s.date;
  }
  return last;
}

export function classPriority(state, cls, today) {
  const avg = classAverage(state, cls.id);
  const target = Number(cls.target ?? state.profile.goalAverage ?? 85);
  const reasons = [];
  let score = 0.1;
  if (avg != null) {
    const gap = target - avg;
    if (gap > 0) {
      score += gap / 10;
      reasons.push({ type: 'gap', avg, target, gap });
    }
    if (avg < 70) score += 0.5;
  } else {
    score += 0.3;
  }
  const test = nextTestFor(state, cls.id, today);
  const days = test ? daysBetween(today, test.date) : null;
  if (test) {
    const u = days <= 1 ? 3 : days <= 3 ? 2 : days <= 7 ? 1 : days <= 14 ? 0.3 : 0;
    if (u > 0) {
      score += u;
      reasons.push({ type: 'test', test, days });
    }
  }
  const trend = classTrend(state, cls.id, 14, today);
  if (trend != null && trend <= -2) {
    score += 0.7;
    reasons.push({ type: 'drop', delta: trend });
  }
  const last = lastStudied(state, cls.id);
  const since = last ? daysBetween(last, today) : null;
  if (since == null || since >= 5) {
    score += 0.4;
    if (since != null) reasons.push({ type: 'stale', since });
  }
  // Order reasons by how much they explain: tests first, then drops, then the gap.
  const order = { test: 0, drop: 1, gap: 2, stale: 3 };
  reasons.sort((a, b) => order[a.type] - order[b.type]);
  return { cls, avg, target, test, days, trend, since, score, reasons };
}

function topicFor(state, p) {
  if (p.test && p.days != null && p.days <= 14) return p.test.title;
  const low = classGrades(state, p.cls.id)
    .filter((g) => g.type !== 'start')
    .slice(-4)
    .sort((a, b) => pct(a) - pct(b))[0];
  if (low && pct(low) < 80) return low.title;
  return 'this week\'s lessons';
}

export function chooseMethod(p, nth, bias) {
  if (p.test && p.days != null) {
    if (p.days <= 1) return nth === 0 ? 'practice' : 'recall';
    if (p.days <= 3) return nth === 0 ? 'recall' : 'practice';
    if (p.days <= 7) return nth === 0 ? 'flashcards' : 'recall';
  }
  if (bias.length) return bias[nth % bias.length];
  if (p.avg != null && p.avg < 75) return nth === 0 ? 'review' : 'mistakes';
  return nth === 0 ? 'flashcards' : 'recall';
}

export function sessionTitle(method, topic) {
  switch (method) {
    case 'practice':
      return `Timed practice test: ${topic}`;
    case 'recall':
      return `Blank-page recall: ${topic}`;
    case 'flashcards':
      return `Flashcards: ${topic}`;
    case 'review':
      return `Review notes + 8 practice problems: ${topic}`;
    case 'mistakes':
      return `Redo the problems you missed: ${topic}`;
    case 'teach':
      return `Explain it out loud: ${topic}`;
    case 'tutor':
      return 'Ask the tutor about your mistakes';
    default:
      return topic;
  }
}

function joinAnd(parts) {
  if (parts.length <= 1) return parts.join('');
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

export function explainPlan(top, picks, minutes) {
  const name = top.cls.name;
  const count = picks.filter((p) => p.cls.id === top.cls.id).length;
  const share =
    count === picks.length
      ? 'all of today\'s time'
      : count > 1
        ? `${count} of today's ${picks.length} sessions`
        : 'the first session';
  const bits = [];
  for (const r of top.reasons) {
    if (r.type === 'test')
      bits.push(`your test (${r.test.title}) is ${r.days === 0 ? 'today' : r.days === 1 ? 'tomorrow' : `in ${r.days} days`}`);
    if (r.type === 'drop') bits.push(`it dropped ${fmtNum(-r.delta, 1)} points in the last two weeks`);
    if (r.type === 'gap') bits.push(`your average (${fmtNum(r.avg, 0)}) is ${fmtNum(r.gap, 0)} points under your goal of ${fmtNum(r.target, 0)}`);
    if (r.type === 'stale') bits.push(`you haven't studied it in ${r.since} days`);
  }
  let text = bits.length
    ? `${name} gets ${share} because ${joinAnd(bits.slice(0, 2))}.`
    : `${name} goes first today to keep it on track.`;
  text += ` Sessions are ${minutes} minutes because short sessions are easier to finish.`;
  return text;
}

/** Inputs that change the plan. When they change and nothing is done yet, the plan is rebuilt. */
export function planBasis(state, date) {
  const s = state.settings;
  return hashOf({
    date,
    c: activeClasses(state).map((c) => [c.id, c.target]),
    g: state.grades.filter((g) => !g.deleted).map((g) => [g.id, g.score, g.maxScore, g.type]),
    t: state.tests.filter((t) => !t.deleted).map((t) => [t.id, t.date, t.classId]),
    s: [s.studyDays, s.studyTime, s.sessionMinutes, s.dailyMinutes],
    goal: state.profile.goalAverage,
  });
}

export function buildPlan(state, date) {
  const s = state.settings;
  const basis = planBasis(state, date);
  const classes = activeClasses(state);
  const week = currentWeek(state, date);
  if (!classes.length) {
    return { date, sessions: [], empty: true, why: 'Add your classes and grades to get a study plan.', week, basis };
  }
  const prios = classes.map((c) => classPriority(state, c, date)).sort((a, b) => b.score - a.score);
  const isStudyDay = s.studyDays.includes(weekday(date));
  const urgent = prios.some((p) => p.days != null && p.days <= 2);
  if (!isStudyDay && !urgent) {
    return {
      date,
      sessions: [],
      rest: true,
      why: 'Rest day. Nothing is planned so you come back fresh. You can still add a session.',
      week,
      basis,
    };
  }
  const L = Number(s.sessionMinutes) || 25;
  const minutes = isStudyDay ? Number(s.dailyMinutes) || 50 : L;
  const n = Math.min(6, Math.max(1, Math.round(minutes / L)));

  const work = prios.map((p) => ({ p, left: p.score, count: 0 }));
  const picks = [];
  for (let i = 0; i < n; i++) {
    work.sort((a, b) => b.left - a.left);
    const top = work[0];
    picks.push(top.p);
    top.count++;
    const testSoon = top.p.days != null && top.p.days <= 3 && top.count < 2;
    top.left *= testSoon ? 0.7 : 0.45;
  }

  const bias = weekInfo(week).bias || [];
  let t = s.studyTime;
  const seen = {};
  const sessions = picks.map((p) => {
    const nth = (seen[p.cls.id] = (seen[p.cls.id] ?? -1) + 1);
    const method = chooseMethod(p, nth, bias);
    const sess = {
      id: uid(),
      classId: p.cls.id,
      method,
      minutes: L,
      start: t,
      title: sessionTitle(method, topicFor(state, p)),
      done: false,
    };
    t = addMinutesHHMM(t, L + 5);
    return sess;
  });
  const top = prios[0];
  if (isStudyDay && top.avg != null && top.avg < 75) {
    sessions.push({
      id: uid(),
      classId: top.cls.id,
      method: 'tutor',
      minutes: 10,
      start: t,
      title: sessionTitle('tutor'),
      done: false,
    });
  }
  return { date, sessions, why: explainPlan(top, picks, L), week, basis, priorities: prios.map((p) => p.cls.id) };
}

/** Plans for a 7-day window. Past and current days use saved plans; future days are previews. */
export function weekPreview(state, startISO, today) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(startISO, i);
    const saved = state.plans[date];
    const plan = date < today ? saved || null : date === today ? saved || buildPlan(state, date) : buildPlan(state, date);
    const done = state.sessions.filter((x) => !x.deleted && x.date === date);
    days.push({ date, plan, doneMinutes: done.reduce((a, b) => a + (b.minutes || 0), 0), doneCount: done.length });
  }
  return days;
}
