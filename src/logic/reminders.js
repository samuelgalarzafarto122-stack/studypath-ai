// Works out which reminders are due and when, from the student's plan, tests and habits.
// Pure function: the app runs it every 30 seconds, saves the next 7 days for the service worker,
// and fires what is due. Grade alerts are not scheduled; they fire the moment a grade is saved.

import { buildPlan } from './planner.js';
import { upcomingTests, classById } from './grades.js';
import { currentWeek, weekInfo, weekRange, PROGRAM_WEEKS } from './program.js';
import { checkinThisWeek, studiedToday, streak } from './stats.js';
import { addDays, atTime, daysBetween, minutesOfDay, todayISO, weekday, fmtMinutes, addMinutesHHMM } from '../util.js';

export const NOTIF_TYPES = {
  study: { label: 'Study reminders', desc: 'When your planned study time starts.' },
  tests: { label: 'Upcoming tests', desc: '3 days before, the evening before, and the morning of each test.' },
  grades: { label: 'Grade alerts', desc: 'When a new grade lowers a class average or is a low score.' },
  checkin: { label: 'Weekly check-in', desc: 'Sunday evening, if you have not checked in yet.' },
  streak: { label: 'Streak saver', desc: '8 PM, if you have a streak going and have not studied yet.' },
  program: { label: 'New program week', desc: 'Monday morning, with the new habit to try.' },
};

export const GRACE_MS = 6 * 3600 * 1000; // a reminder up to 6 hours late is still shown

export function inQuietHours(date, settings) {
  const m = date.getHours() * 60 + date.getMinutes();
  const qs = minutesOfDay(settings.quietStart);
  const qe = minutesOfDay(settings.quietEnd);
  if (qs === qe) return false;
  return qs > qe ? m >= qs || m < qe : m >= qs && m < qe;
}

export function computeSchedule(state, now = new Date(), days = 7) {
  const s = state.settings;
  const on = s.notifications || {};
  const today = todayISO(now);
  const items = [];
  const add = (type, key, at, title, body, url) => {
    if (!on[type]) return;
    if (inQuietHours(at, s)) return;
    items.push({ key, type, at: at.getTime(), title, body, url });
  };
  if (!state.onboarded) return [];

  // Study reminders: one per day, when the first unfinished session starts.
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const plan = state.plans[date] || buildPlan(state, date);
    const open = (plan.sessions || []).filter((x) => !x.done);
    if (!open.length) continue;
    const first = open[0];
    const cls = classById(state, first.classId);
    const total = open.reduce((a, b) => a + (b.minutes || 0), 0);
    add(
      'study',
      `study:${date}:${first.start}`,
      atTime(date, first.start),
      `Time to study${cls ? `: ${cls.name} first` : ''}`,
      `${open.length} session${open.length > 1 ? 's' : ''} today, ${fmtMinutes(total)}. First up: ${first.title}.`,
      '#plan',
    );
  }

  // Tests: 3 days before, the evening before, and the morning of.
  for (const t of upcomingTests(state, today, days + 3)) {
    const cls = classById(state, t.classId);
    const name = cls ? cls.name : 'Your';
    const marks = [
      { off: 3, time: addMinutesHHMM(s.studyTime, -60), title: `${name} test in 3 days`, body: `${t.title}. Your plan now has extra review for it. Start with active recall.` },
      { off: 1, time: '19:30', title: `${name} test tomorrow`, body: `${t.title}. Do a quick recall session, pack your things, and get 8 hours of sleep.` },
      { off: 0, time: '07:15', title: `${name} test today`, body: `Good luck on ${t.title}! Breathe slowly, start with the questions you know.` },
    ];
    for (const m of marks) {
      const date = addDays(t.date, -m.off);
      if (daysBetween(today, date) < 0 || daysBetween(today, date) >= days) continue;
      add('tests', `test:${t.id}:${m.off}`, atTime(date, m.time), m.title, m.body, '#grades');
    }
  }

  // Weekly check-in on Sunday at 18:00, if this program week has none yet.
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    if (weekday(date) !== 0) continue;
    const w = currentWeek(state, date);
    if (checkinThisWeek(state, w)) continue;
    add('checkin', `checkin:${date}`, atTime(date, '18:00'), 'Weekly check-in', `Two minutes: how did week ${w} go? It helps your plan adapt.`, '#progress');
  }

  // New program week on its first morning.
  for (let i = 1; i < days; i++) {
    const date = addDays(today, i);
    const w = currentWeek(state, date);
    if (w <= 1 || w > PROGRAM_WEEKS) continue;
    if (weekRange(state, w).start !== date) continue;
    const info = weekInfo(w);
    add('program', `program:${w}`, atTime(date, '08:00'), `Week ${w}: ${info.title}`, `This week's habit: ${info.habit}. Open the 3-minute lesson.`, '#program');
  }

  // Streak saver tonight at 20:00.
  const st = streak(state, today);
  if (st >= 2 && !studiedToday(state, today)) {
    add('streak', `streak:${today}`, atTime(today, '20:00'), `Keep your ${st}-day streak`, 'One short session today keeps it going. Even 10 minutes counts.', '#plan');
  }

  const cutoff = now.getTime() - GRACE_MS;
  return items.filter((it) => it.at > cutoff).sort((a, b) => a.at - b.at);
}

/** Items whose time has come and that were not shown yet. */
export function dueItems(schedule, fired, now = Date.now()) {
  return schedule.filter((it) => it.at <= now && it.at > now - GRACE_MS && !fired[it.key]);
}

/** Drop fired keys older than two weeks. */
export function pruneFired(fired, now = Date.now()) {
  const out = {};
  for (const [k, t] of Object.entries(fired || {})) if (now - t < 14 * 86400000) out[k] = t;
  return out;
}
