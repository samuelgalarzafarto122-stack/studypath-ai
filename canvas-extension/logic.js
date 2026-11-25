/* StudyPath for Canvas: plan logic. Pure functions, no browser APIs, so it can be tested with Node.
   Input is "normalized" Canvas data (see canvas-api.js):
     { courses:  [{ id, name, score }],                       score = current % or null
       upcoming: [{ title, courseId, due, isTest, url, done }],
       missing:  [{ title, courseId, due, url }] }
   Settings: { goal: 85, minutes: 45 } */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const TEST_WORDS = /\b(test|exam|quiz|midterm|final|unit assessment|examen|prueba)\b/i;

  function looksLikeTest(title, type) {
    return type === "quiz" || TEST_WORDS.test(title || "");
  }

  function daysUntil(iso, now) {
    if (!iso) return null;
    // Calendar days in local time: due tomorrow 9 AM counts as 1 even at 10 PM tonight.
    const a = new Date(now); a.setHours(0, 0, 0, 0);
    const b = new Date(iso); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / DAY);
  }

  function status(score, goal) {
    if (score == null) return "none";
    if (score >= goal) return "good";
    if (score >= goal - 10) return "watch";
    return "help";
  }

  const STATUS_LABEL = { good: "On track", watch: "Watch", help: "Needs help", none: "No grade yet" };

  /* How much a class needs time today. Each part is explained so the plan can say why. */
  function coursePriority(course, data, settings, now) {
    const goal = settings.goal;
    const reasons = [];
    let p = 0;

    if (course.score != null && course.score < goal) {
      const gap = goal - course.score;
      p += gap * 1.2;
      reasons.push(`${Math.round(gap)} points under your ${goal}% goal`);
    }

    const missing = data.missing.filter((m) => m.courseId === course.id);
    if (missing.length) {
      p += 10 + missing.length * 6;
      reasons.push(`${missing.length} missing assignment${missing.length > 1 ? "s" : ""}`);
    }

    const open = data.upcoming.filter((u) => u.courseId === course.id && !u.done);
    const tests = open.filter((u) => u.isTest).map((u) => ({ ...u, days: daysUntil(u.due, now) }))
      .filter((u) => u.days != null && u.days >= 0 && u.days <= 7)
      .sort((a, b) => a.days - b.days);
    if (tests.length) {
      const t = tests[0];
      p += (8 - t.days) * 5;
      reasons.push(t.days === 0 ? `"${t.title}" is today` : t.days === 1 ? `"${t.title}" is tomorrow` : `"${t.title}" in ${t.days} days`);
    }

    const dueSoon = open.filter((u) => !u.isTest).filter((u) => {
      const d = daysUntil(u.due, now);
      return d != null && d >= 0 && d <= 2;
    });
    if (dueSoon.length) {
      p += dueSoon.length * 4;
      reasons.push(`${dueSoon.length} due in the next 2 days`);
    }

    return { course, priority: p, reasons, missing, nextTest: tests[0] || null, dueSoon };
  }

  /* Pick a study method that fits the reason, like the main StudyPath app. */
  function chooseSession(pr) {
    if (pr.missing.length) {
      const m = [...pr.missing].sort((a, b) => (a.due || "").localeCompare(b.due || ""))[0];
      return { method: "Catch up", title: `Finish "${m.title}"`, tip: "Missing work counts as zero. Even a late, partial submission usually beats nothing. Ask your teacher if late work is accepted.", url: m.url };
    }
    if (pr.nextTest) {
      return { method: "Practice test", title: `Practice for "${pr.nextTest.title}"`, tip: "Do problems without notes first, then check. Testing yourself beats rereading.", url: pr.nextTest.url };
    }
    if (pr.dueSoon.length) {
      const d = pr.dueSoon[0];
      return { method: "Get it done", title: `Work on "${d.title}"`, tip: "Start with the part you understand least while your focus is fresh.", url: d.url };
    }
    if (pr.course.score != null) {
      return { method: "Error analysis", title: "Review your graded work", tip: "Pick 3 questions you got wrong, find why, and redo them without looking.", url: null };
    }
    return { method: "Spaced review", title: "Quick review of this week's notes", tip: "Close the notes and write what you remember on a blank page, then fill the gaps.", url: null };
  }

  function roundTo5(n) { return Math.max(10, Math.round(n / 5) * 5); }

  function buildPlan(data, settings, now = new Date()) {
    const ranked = data.courses.map((c) => coursePriority(c, data, settings, now))
      .sort((a, b) => b.priority - a.priority);
    const needs = ranked.filter((r) => r.priority > 0);
    const picks = (needs.length ? needs : ranked).slice(0, 3);
    const total = picks.reduce((s, r) => s + Math.max(r.priority, 1), 0) || 1;
    let left = settings.minutes;
    const sessions = picks.map((r, i) => {
      const share = i === picks.length - 1 ? left : Math.min(left, roundTo5(settings.minutes * Math.max(r.priority, 1) / total));
      left -= share;
      return { courseId: r.course.id, courseName: r.course.name, minutes: share, why: r.reasons, ...chooseSession(r) };
    }).filter((s) => s.minutes > 0);

    let summary;
    if (!sessions.length) summary = "No classes found yet.";
    else if (!needs.length) summary = "Everything looks on track. Keep a short review so it stays that way.";
    else summary = `${sessions[0].courseName} comes first today because ${sessions[0].why[0]}.`;

    return { sessions, ranked, summary };
  }

  function overview(data, settings, now = new Date()) {
    const scored = data.courses.filter((c) => c.score != null);
    const avg = scored.length ? scored.reduce((s, c) => s + c.score, 0) / scored.length : null;
    const week = data.upcoming.filter((u) => {
      const d = daysUntil(u.due, now);
      return !u.done && d != null && d >= 0 && d <= 7;
    });
    return {
      average: avg,
      missingCount: data.missing.length,
      dueThisWeek: week.length,
      testsThisWeek: week.filter((u) => u.isTest).length,
      belowGoal: scored.filter((c) => c.score < settings.goal).length,
    };
  }

  function dueLabel(iso, now = new Date()) {
    if (!iso) return "No due date";
    const d = daysUntil(iso, now);
    const time = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d < 0) return `${-d} day${d === -1 ? "" : "s"} late`;
    if (d === 0) return `Today ${time}`;
    if (d === 1) return `Tomorrow ${time}`;
    return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  const api = { looksLikeTest, daysUntil, status, STATUS_LABEL, coursePriority, chooseSession, buildPlan, overview, dueLabel };
  root.StudyPathLogic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
