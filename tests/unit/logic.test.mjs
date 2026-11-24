// Unit tests for the parts that decide things: averages, the study plan, reminders, research privacy.
// Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../../src/state.js';
import { buildSampleState } from '../../src/logic/sample.js';
import { weightedAverage, status, gradeImpact, classAverage, overallAverage } from '../../src/logic/grades.js';
import { buildPlan } from '../../src/logic/planner.js';
import { computeSchedule, inQuietHours } from '../../src/logic/reminders.js';
import { researchSummary, aggregateResearch, simulatedSummaries, MIN_GROUP } from '../../src/logic/research.js';
import { html, raw, addDays, todayISO, prettyMath } from '../../src/util.js';

const TODAY = '2026-11-23'; // a Monday

function student() {
  const s = emptyState(TODAY);
  s.onboarded = true;
  s.profile.nickname = 'Sam';
  s.classes = [
    { id: 'alg', name: 'Algebra 2', color: 's1', target: 80, createdAt: TODAY, updatedAt: TODAY },
    { id: 'bio', name: 'Biology', color: 's2', target: 85, createdAt: TODAY, updatedAt: TODAY },
  ];
  s.grades = [
    { id: 'g1', classId: 'alg', type: 'quiz', title: 'Quiz 1', score: 70, maxScore: 100, date: addDays(TODAY, -10) },
    { id: 'g2', classId: 'bio', type: 'test', title: 'Cells', score: 90, maxScore: 100, date: addDays(TODAY, -8) },
  ];
  return s;
}

test('weighted average: tests count 3x, quizzes 2x, homework 1x', () => {
  const avg = weightedAverage([
    { type: 'test', score: 60, maxScore: 100 },
    { type: 'homework', score: 100, maxScore: 100 },
  ]);
  assert.equal(Math.round(avg * 10) / 10, 70); // (60*3 + 100*1) / 4
  assert.equal(weightedAverage([]), null);
});

test('status labels follow the thresholds', () => {
  assert.equal(status(65).key, 'help');
  assert.equal(status(75).key, 'watch');
  assert.equal(status(85).key, 'track');
  assert.equal(status(null).key, 'none');
});

test('a low grade is flagged as a drop', () => {
  const s = student();
  const before = classAverage(s, 'alg');
  const impact = gradeImpact(s, { classId: 'alg', type: 'test', score: 50, maxScore: 100, date: TODAY });
  assert.equal(Math.round(impact.before), Math.round(before));
  assert.ok(impact.after < impact.before);
  assert.equal(impact.isDrop, true);
  assert.ok(overallAverage(s) > 0);
});

test('the plan puts a class with a test in 3 days first and fits the daily minutes', () => {
  const s = student();
  s.tests = [{ id: 't1', classId: 'bio', title: 'Genetics', date: addDays(TODAY, 3) }];
  const plan = buildPlan(s, TODAY);
  assert.ok(plan.sessions.length >= 1);
  assert.equal(plan.sessions[0].classId, 'bio');
  const minutes = plan.sessions.reduce((t, x) => t + x.minutes, 0);
  assert.ok(minutes <= s.settings.dailyMinutes + 10, `planned ${minutes} min`);
  assert.ok(typeof plan.why === 'string' && plan.why.length > 10);
});

test('no study sessions on a rest day', () => {
  const s = student();
  const saturday = addDays(TODAY, 5);
  const plan = buildPlan(s, saturday);
  assert.equal(plan.sessions.length, 0);
});

test('reminders respect quiet hours and switched-off types', () => {
  const s = student();
  s.settings.notifications = { enabled: true, study: true, tests: true, grades: true, checkin: true, streak: true, program: true };
  s.tests = [{ id: 't1', classId: 'bio', title: 'Genetics', date: addDays(TODAY, 3) }];
  s.plans[TODAY] = buildPlan(s, TODAY);
  const now = new Date(`${TODAY}T08:00:00`);
  const items = computeSchedule(s, now, 7);
  assert.ok(items.some((i) => i.type === 'tests'), 'test reminders expected');
  for (const it of items) assert.equal(inQuietHours(new Date(it.at), s.settings), false, `${it.key} falls in quiet hours`);
  s.settings.notifications.tests = false;
  assert.ok(!computeSchedule(s, now, 7).some((i) => i.type === 'tests'), 'switched-off type must not be scheduled');
});

test('the research summary has numbers only: no names, notes or chat text', () => {
  const s = buildSampleState(todayISO());
  const sum = researchSummary(s);
  const text = JSON.stringify(sum);
  assert.ok(!text.includes(s.profile.nickname), 'nickname leaked');
  for (const c of s.classes) assert.ok(!text.includes(c.name), `class name ${c.name} leaked`);
  for (const t of s.tutor) for (const m of t.messages || []) if (m.text && m.text.length > 12) assert.ok(!text.includes(m.text), 'tutor text leaked');
  for (const c of s.checkins) if (c.note) assert.ok(!text.includes(c.note), 'check-in note leaked');
  const allowed = new Set(['v', 'week', 'gradeLevel', 'startAvg', 'nowAvg', 'avgWeeklyMinutes', 'weeks', 'updated']);
  for (const k of Object.keys(sum)) assert.ok(allowed.has(k), `unexpected field ${k}`);
  for (const w of sum.weeks) for (const [k, v] of Object.entries(w)) assert.ok(v === null || typeof v === 'number', `week field ${k} is not a number`);
});

test(`research totals stay hidden until ${MIN_GROUP} students share`, () => {
  const few = aggregateResearch(simulatedSummaries(MIN_GROUP - 1, 4));
  assert.equal(few.tooFew, true);
  assert.equal(few.weeks.length, 0);
  assert.equal(few.change, null);
  const enough = aggregateResearch(simulatedSummaries(24, 6));
  assert.equal(enough.tooFew, false);
  assert.equal(enough.weeks.length, 6);
  for (const w of enough.weeks) assert.ok(w.n >= MIN_GROUP);
  for (const d of enough.dose) if (d.n < MIN_GROUP) assert.equal(d.avgDelta, null, 'a small group must be hidden');
});

test('html templates escape what students type (no injected markup)', () => {
  const name = '<img src=x onerror=alert(1)>';
  const out = String(html`<b>${name}</b>`);
  assert.ok(!out.includes('<img'), out);
  assert.ok(String(html`${raw('<i>ok</i>')}`).includes('<i>ok</i>'));
});

test('math titles look like math', () => {
  assert.equal(prettyMath('x^2 + 3x - 4 = 0'), 'x² + 3x - 4 = 0');
});
