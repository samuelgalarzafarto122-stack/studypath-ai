// Plain-language insights the app finds in the student's own data.
// Each insight needs enough data points before it is shown, so it never claims a pattern from one grade.

import { activeClasses, classGrades, pct, classTrend, overallAverage } from './grades.js';
import { hintsByWeek, doneSessions, weeklyMinutes } from './stats.js';
import { addDays, mean, fmtNum, todayISO, startOfWeekISO, minutesOfDay } from '../util.js';

const STUDY_THRESHOLD = 45; // minutes in the 7 days before a grade

export function studyEffect(state) {
  const sessions = doneSessions(state);
  const results = [];
  for (const c of activeClasses(state)) {
    const studied = [];
    const notStudied = [];
    for (const g of classGrades(state, c.id)) {
      if (g.type === 'start') continue;
      const from = addDays(g.date, -7);
      const mins = sessions
        .filter((s) => s.classId === c.id && s.date >= from && s.date < g.date)
        .reduce((a, b) => a + (b.minutes || 0), 0);
      (mins >= STUDY_THRESHOLD ? studied : notStudied).push(pct(g));
    }
    if (studied.length >= 2 && notStudied.length >= 2) {
      const a = mean(studied);
      const b = mean(notStudied);
      results.push({ cls: c, withStudy: a, without: b, diff: a - b, n: studied.length + notStudied.length });
    }
  }
  return results.sort((x, y) => y.diff - x.diff);
}

export function focusByTime(state) {
  const buckets = { morning: [], afternoon: [], evening: [] };
  for (const s of doneSessions(state)) {
    if (!s.focus || !s.startTime) continue;
    const m = minutesOfDay(s.startTime);
    const k = m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening';
    buckets[k].push(s.focus);
  }
  return Object.entries(buckets)
    .filter(([, v]) => v.length >= 3)
    .map(([k, v]) => ({ when: k, avg: mean(v), n: v.length }))
    .sort((a, b) => b.avg - a.avg);
}

export function computeInsights(state, today = todayISO()) {
  const out = [];

  const effect = studyEffect(state)[0];
  if (effect && effect.diff >= 5) {
    out.push({
      tone: 'good',
      icon: 'spark',
      title: `Studying works in ${effect.cls.name}`,
      body: `Grades after ${STUDY_THRESHOLD}+ minutes of ${effect.cls.name} study that week averaged ${fmtNum(effect.withStudy, 0)}%, compared with ${fmtNum(effect.without, 0)}% without.`,
      rank: 1,
    });
  }

  const hints = hintsByWeek(state);
  if (hints.length >= 3) {
    const half = Math.floor(hints.length / 2);
    const early = mean(hints.slice(0, half).map((h) => h.avg));
    const late = mean(hints.slice(half).map((h) => h.avg));
    if (early - late >= 0.5) {
      out.push({
        tone: 'good',
        icon: 'bulb',
        title: 'You need fewer hints',
        body: `You went from ${fmtNum(early, 1)} to ${fmtNum(late, 1)} hints per solved problem. That means you're solving more on your own.`,
        rank: 2,
      });
    }
  }

  const start = state.program.startDate;
  const startAvg = overallAverage(state, { until: addDays(start, 6) });
  const nowAvg = overallAverage(state);
  if (startAvg != null && nowAvg != null && nowAvg - startAvg >= 1 && today > addDays(start, 13)) {
    out.push({
      tone: 'good',
      icon: 'up',
      title: 'Your average is going up',
      body: `It went from ${fmtNum(startAvg, 1)} in week 1 to ${fmtNum(nowAvg, 1)} now.`,
      rank: 3,
    });
  }

  for (const c of activeClasses(state)) {
    const tr = classTrend(state, c.id, 14, today);
    if (tr != null && tr <= -3) {
      out.push({
        tone: 'warn',
        icon: 'down',
        title: `${c.name} dropped ${fmtNum(-tr, 1)} points`,
        body: `That's over the last two weeks. Your plan now gives ${c.name} more time, and the tutor can help you find what went wrong.`,
        rank: 0,
      });
    }
  }

  const focus = focusByTime(state);
  if (focus.length >= 2 && focus[0].avg - focus[focus.length - 1].avg >= 0.5) {
    out.push({
      tone: 'info',
      icon: 'clock',
      title: `You focus best in the ${focus[0].when}`,
      body: `Your focus rating averages ${fmtNum(focus[0].avg, 1)}/5 in the ${focus[0].when} and ${fmtNum(focus[focus.length - 1].avg, 1)}/5 in the ${focus[focus.length - 1].when}.`,
      rank: 4,
    });
  }

  const weeks = weeklyMinutes(state, today);
  if (weeks.length >= 2) {
    const cur = weeks[weeks.length - 1];
    const best = Math.max(...weeks.slice(0, -1).map((w) => w.minutes));
    if (cur.minutes > best && cur.minutes >= 60) {
      out.push({
        tone: 'good',
        icon: 'flame',
        title: 'Your best study week yet',
        body: `${fmtNum(cur.minutes / 60, 1)} hours so far this program week.`,
        rank: 5,
      });
    }
  }

  return out.sort((a, b) => a.rank - b.rank).slice(0, 4);
}

export function weekKey(today = todayISO()) {
  return startOfWeekISO(today);
}
