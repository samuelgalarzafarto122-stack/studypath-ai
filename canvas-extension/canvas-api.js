/* StudyPath for Canvas: reading Canvas data.
   Runs on a Canvas page the student is already signed in to, so the Canvas REST API answers with the
   student's own data through their session. No password or API token is needed or stored.
   Only GET requests are made: the extension never changes anything in Canvas. */
(function (root) {
  "use strict";
  const L = root.StudyPathLogic;

  async function get(path) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) throw new Error("signed-out");
    if (!res.ok) throw new Error(`Canvas answered ${res.status} for ${path.split("?")[0]}`);
    // Canvas can prefix JSON with "while(1);" (anti-JSON-hijacking). Strip it before parsing.
    const text = await res.text();
    return JSON.parse(text.replace(/^while\(1\);/, ""));
  }

  function studentScore(course) {
    const e = (course.enrollments || []).find((x) => x.type === "student" || x.type === "StudentEnrollment") || {};
    const s = e.computed_current_score ?? e.grades?.current_score;
    return typeof s === "number" ? s : null;
  }

  function normalize(courses, planner, missing) {
    const ids = new Set();
    const outCourses = courses
      .filter((c) => c && c.name && !c.access_restricted_by_date)
      .filter((c) => (c.enrollments || []).some((e) => /student/i.test(e.type || "")))
      .map((c) => { ids.add(c.id); return { id: c.id, name: c.name, score: studentScore(c) }; });

    const upcoming = planner
      .filter((p) => p.plannable && ["assignment", "quiz", "discussion_topic", "assessment_request"].includes(p.plannable_type))
      .map((p) => {
        const sub = p.submissions || {};
        const title = p.plannable.title || p.plannable.name || "Untitled";
        return {
          title,
          courseId: p.course_id,
          due: p.plannable.due_at || p.plannable_date || null,
          isTest: L.looksLikeTest(title, p.plannable_type),
          url: p.html_url || null,
          done: Boolean(sub.submitted || sub.graded || sub.excused || p.planner_override?.marked_complete),
        };
      });

    const outMissing = missing.map((m) => ({
      title: m.name || "Untitled",
      courseId: m.course_id,
      due: m.due_at || null,
      url: m.html_url || null,
    }));

    return { courses: outCourses, upcoming, missing: outMissing, loadedAt: new Date().toISOString() };
  }

  async function load(now = new Date()) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 14 * 86400000);
    const [courses, planner, missing] = await Promise.all([
      get("/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100"),
      get(`/api/v1/planner/items?start_date=${start.toISOString()}&end_date=${end.toISOString()}&per_page=100`),
      get("/api/v1/users/self/missing_submissions?filter[]=submittable&filter[]=current_grading_period&per_page=100")
        .catch(() => get("/api/v1/users/self/missing_submissions?per_page=100")),
    ]);
    return normalize(courses, planner, missing);
  }

  /* Demo data for presentations: a made-up student, so no real grades are ever shown. */
  function demoData(now = new Date()) {
    const at = (days, h = 23, m = 59) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };
    return {
      demo: true,
      loadedAt: now.toISOString(),
      courses: [
        { id: 1, name: "Algebra II", score: 71.4 },
        { id: 2, name: "Biology", score: 82.0 },
        { id: 3, name: "English 10", score: 90.5 },
        { id: 4, name: "World History", score: 78.2 },
        { id: 5, name: "Spanish III", score: 94.1 },
      ],
      upcoming: [
        { title: "Unit 4 Test: Quadratics", courseId: 1, due: at(2, 8, 0), isTest: true, url: null, done: false },
        { title: "Factoring practice set", courseId: 1, due: at(1), isTest: false, url: null, done: false },
        { title: "Cell Respiration Quiz", courseId: 2, due: at(5, 9, 30), isTest: true, url: null, done: false },
        { title: "Lab report: Enzymes", courseId: 2, due: at(3), isTest: false, url: null, done: false },
        { title: "Essay outline: Of Mice and Men", courseId: 3, due: at(4), isTest: false, url: null, done: true },
        { title: "Reading notes ch. 12", courseId: 4, due: at(1), isTest: false, url: null, done: false },
        { title: "Vocab quiz 7", courseId: 5, due: at(6, 10, 0), isTest: true, url: null, done: false },
      ],
      missing: [
        { title: "WWI primary source analysis", courseId: 4, due: at(-3), url: null },
        { title: "Homework 4.2", courseId: 1, due: at(-1), url: null },
      ],
    };
  }

  root.StudyPathCanvas = { get, normalize, load, demoData };
})(typeof globalThis !== "undefined" ? globalThis : this);
