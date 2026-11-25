import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../../canvas-extension/logic.js");
require("../../canvas-extension/canvas-api.js");
const C = globalThis.StudyPathCanvas;

const now = new Date("2026-11-25T15:00:00");
const settings = { goal: 85, minutes: 45 };

test("calendar days, not 24h blocks", () => {
  const late = new Date("2026-11-25T22:00:00");
  assert.equal(L.daysUntil("2026-11-26T09:00:00", late), 1);
  assert.equal(L.daysUntil("2026-11-25T23:59:00", late), 0);
  assert.equal(L.daysUntil("2026-11-24T23:59:00", late), -1);
});

test("test detection", () => {
  assert.ok(L.looksLikeTest("Unit 4 Test", "assignment"));
  assert.ok(L.looksLikeTest("anything", "quiz"));
  assert.ok(L.looksLikeTest("Examen final", "assignment"));
  assert.ok(!L.looksLikeTest("Lab report: Enzymes", "assignment"));
  assert.ok(!L.looksLikeTest("Contest entry", "assignment"));
});

test("status bands", () => {
  assert.equal(L.status(90, 85), "good");
  assert.equal(L.status(80, 85), "watch");
  assert.equal(L.status(70, 85), "help");
  assert.equal(L.status(null, 85), "none");
});

test("demo plan puts the weakest class with a test and missing work first, and fits the minutes", () => {
  const data = C.demoData(now);
  const plan = L.buildPlan(data, settings, now);
  assert.equal(plan.sessions[0].courseName, "Algebra II");
  assert.equal(plan.sessions[0].method, "Catch up"); // missing homework comes before test prep
  assert.equal(plan.sessions.reduce((s, x) => s + x.minutes, 0), 45);
  assert.ok(plan.sessions.length <= 3);
  assert.match(plan.summary, /Algebra II comes first/);
});

test("all on track gives a calm plan", () => {
  const data = { courses: [{ id: 1, name: "A", score: 95 }, { id: 2, name: "B", score: 90 }], upcoming: [], missing: [] };
  const plan = L.buildPlan(data, settings, now);
  assert.match(plan.summary, /on track/);
  assert.equal(plan.sessions.reduce((s, x) => s + x.minutes, 0), 45);
});

test("no courses", () => {
  const plan = L.buildPlan({ courses: [], upcoming: [], missing: [] }, settings, now);
  assert.equal(plan.sessions.length, 0);
});

test("overview counts", () => {
  const ov = L.overview(C.demoData(now), settings, now);
  assert.equal(ov.missingCount, 2);
  assert.equal(ov.testsThisWeek, 3);
  assert.equal(ov.dueThisWeek, 6); // the done essay is not counted
  assert.equal(ov.belowGoal, 3);
});

test("normalize Canvas API shapes", () => {
  const courses = [
    { id: 10, name: "Chem", enrollments: [{ type: "student", computed_current_score: 77.5 }] },
    { id: 11, name: "Teaching aide", enrollments: [{ type: "ta" }] },
    { id: 12, name: "Old", access_restricted_by_date: true },
  ];
  const planner = [
    { plannable_type: "quiz", course_id: 10, plannable: { title: "Moles", due_at: "2026-11-27T13:00:00Z" }, submissions: { submitted: false }, html_url: "/courses/10/quizzes/1" },
    { plannable_type: "announcement", course_id: 10, plannable: { title: "Hi" } },
    { plannable_type: "assignment", course_id: 10, plannable: { title: "WS 3" }, plannable_date: "2026-11-26T05:59:00Z", submissions: false },
  ];
  const missing = [{ name: "Lab 2", course_id: 10, due_at: "2026-11-20T05:59:00Z", html_url: "/x" }];
  const d = C.normalize(courses, planner, missing);
  assert.deepEqual(d.courses, [{ id: 10, name: "Chem", score: 77.5 }]);
  assert.equal(d.upcoming.length, 2);
  assert.equal(d.upcoming[0].isTest, true);
  assert.equal(d.upcoming[1].due, "2026-11-26T05:59:00Z");
  assert.equal(d.upcoming[1].done, false);
  assert.equal(d.missing[0].title, "Lab 2");
});
