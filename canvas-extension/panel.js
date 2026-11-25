/* StudyPath for Canvas: the panel shown on Canvas pages.
   Everything is drawn inside a Shadow DOM so Canvas styles and StudyPath styles never mix. */
(function (root) {
  "use strict";
  if (root.__studypathPanel) return; // the script can be injected twice (manifest + "use on this site")
  root.__studypathPanel = true;

  const L = root.StudyPathLogic;
  const C = root.StudyPathCanvas;
  const APP_URL = "https://samuelgalarzafarto122-stack.github.io/studypath-ai/";
  const DEFAULTS = { goal: 85, minutes: 45, demo: false, open: false };
  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  const forcedDemo = root.STUDYPATH_DEMO === true; // set by demo.html

  /* ---------- settings ---------- */
  async function loadSettings() {
    try {
      if (hasChrome) return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("studypath-ext") || "{}") };
    } catch { return { ...DEFAULTS }; }
  }
  async function saveSettings(patch) {
    Object.assign(settings, patch);
    try {
      if (hasChrome) await chrome.storage.local.set(patch);
      else localStorage.setItem("studypath-ext", JSON.stringify(settings));
    } catch { /* settings are a convenience; the panel works without saving them */ }
  }

  /* ---------- is this Canvas? ---------- */
  function isCanvas() {
    return forcedDemo || /\.instructure\.com$/.test(location.hostname) ||
      Boolean(document.querySelector("#application.ic-app, link[href*='instructure']"));
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const asset = (p) => (typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL(p) : p);

  /* ---------- state ---------- */
  let settings = { ...DEFAULTS };
  let data = null;
  let error = null;
  let loading = false;
  let timer = null; // { idx, endsAt, handle }
  let shadow, panel, launcher, body;

  async function refresh() {
    loading = true; error = null; render();
    try {
      data = settings.demo || forcedDemo ? C.demoData() : await C.load();
    } catch (e) {
      data = null;
      error = e.message === "signed-out" ? "Sign in to Canvas, then refresh." : `Couldn't read Canvas data (${e.message}).`;
    }
    loading = false; render();
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    saveSettings({ open });
    if (open && !data && !loading) refresh();
  }

  /* ---------- focus timer ---------- */
  function startTimer(idx, minutes) {
    stopTimer();
    timer = { idx, endsAt: Date.now() + minutes * 60000, handle: setInterval(tick, 1000) };
    render();
  }
  function stopTimer() {
    if (timer) clearInterval(timer.handle);
    timer = null;
  }
  function tick() {
    const el = shadow.querySelector("[data-timer]");
    const left = Math.max(0, timer.endsAt - Date.now());
    if (el) el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
    if (left === 0) { stopTimer(); render(true); }
  }

  /* ---------- views ---------- */
  function statChip(label, value, tone) {
    return h("div", { class: `stat ${tone || ""}` }, h("b", {}, value), h("span", {}, label));
  }

  function courseName(id) {
    return data.courses.find((c) => c.id === id)?.name || "Class";
  }

  function link(text, url) {
    return url ? h("a", { href: url, target: "_top" }, text) : h("span", {}, text);
  }

  function viewSummary(ov) {
    return h("div", { class: "stats" },
      statChip("Average", ov.average == null ? "–" : `${Math.round(ov.average)}%`, ov.average != null && ov.average < settings.goal ? "warn" : ""),
      statChip("Missing", ov.missingCount, ov.missingCount ? "bad" : "good"),
      statChip("Due this week", ov.dueThisWeek),
      statChip("Tests this week", ov.testsThisWeek, ov.testsThisWeek ? "warn" : ""));
  }

  function viewPlan(plan, finished) {
    const total = plan.sessions.reduce((s, x) => s + x.minutes, 0);
    return h("section", {},
      h("div", { class: "sec-head" }, h("h3", {}, "Today's plan"), h("span", { class: "muted" }, `${total} min`)),
      h("p", { class: "why" }, plan.summary),
      finished ? h("p", { class: "done-note", role: "status" }, "Session done. Nice work! Take a 5 minute break.") : null,
      h("ol", { class: "sessions" }, plan.sessions.map((s, i) => {
        const running = timer && timer.idx === i;
        return h("li", { class: "session" },
          h("div", { class: "session-top" },
            h("span", { class: "pill" }, s.method),
            h("span", { class: "muted" }, `${s.minutes} min`)),
          h("div", { class: "session-title" }, link(s.title, s.url)),
          h("div", { class: "muted small" }, s.courseName, s.why.length ? ` · ${s.why.join(" · ")}` : ""),
          h("p", { class: "tip" }, s.tip),
          running
            ? h("div", { class: "timer-row" },
              h("span", { class: "timer", "data-timer": true, "aria-live": "off" }, `${s.minutes}:00`),
              h("button", { class: "btn ghost", onclick: () => { stopTimer(); render(); } }, "Stop"))
            : h("button", { class: "btn", onclick: () => startTimer(i, s.minutes) }, `Start ${s.minutes}-min focus`));
      })));
  }

  function viewClasses(plan) {
    const sorted = [...data.courses].sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
    return h("section", {},
      h("div", { class: "sec-head" }, h("h3", {}, "Classes"), h("span", { class: "muted" }, `Goal ${settings.goal}%`)),
      h("ul", { class: "classes" }, sorted.map((c) => {
        const st = L.status(c.score, settings.goal);
        const pct = c.score == null ? 0 : Math.max(0, Math.min(100, c.score));
        return h("li", {},
          h("div", { class: "class-row" },
            h("span", { class: "class-name" }, c.name),
            h("span", { class: `badge ${st}` }, L.STATUS_LABEL[st]),
            h("b", { class: "score" }, c.score == null ? "–" : `${c.score.toFixed(1)}%`)),
          h("div", { class: "bar", role: "img", "aria-label": `${c.name}: ${c.score == null ? "no grade" : Math.round(c.score) + "%"}` },
            h("span", { class: `fill ${st}`, style: `width:${pct}%` }),
            h("i", { class: "goal", style: `left:${settings.goal}%` })));
      })));
  }

  function viewList(title, items, empty, cls) {
    return h("section", {},
      h("div", { class: "sec-head" }, h("h3", {}, title), h("span", { class: "muted" }, items.length)),
      items.length
        ? h("ul", { class: `items ${cls || ""}` }, items.map((it) => h("li", {},
          h("div", { class: "item-title" }, it.isTest ? h("span", { class: "pill test" }, "Test") : null, link(it.title, it.url)),
          h("div", { class: "muted small" }, `${courseName(it.courseId)} · ${L.dueLabel(it.due)}`))))
        : h("p", { class: "muted" }, empty));
  }

  function viewSettings() {
    const goal = h("input", { type: "number", min: 50, max: 100, step: 1, value: settings.goal, id: "sp-goal" });
    const mins = h("input", { type: "number", min: 15, max: 180, step: 5, value: settings.minutes, id: "sp-min" });
    const demo = h("input", { type: "checkbox", id: "sp-demo", checked: settings.demo || forcedDemo, disabled: forcedDemo });
    return h("details", { class: "settings" },
      h("summary", {}, "Settings"),
      h("label", { for: "sp-goal" }, "Goal for every class (%)", goal),
      h("label", { for: "sp-min" }, "Study minutes per day", mins),
      h("label", { class: "check", for: "sp-demo" }, demo, "Demo mode (made-up student, for presentations)"),
      h("button", {
        class: "btn", onclick: async () => {
          await saveSettings({
            goal: Math.min(100, Math.max(50, Number(goal.value) || 85)),
            minutes: Math.min(180, Math.max(15, Number(mins.value) || 45)),
            demo: demo.checked,
          });
          refresh();
        },
      }, "Save"));
  }

  function render(finished = false) {
    if (!body) return;
    body.replaceChildren();
    if (loading) { body.append(h("p", { class: "muted center", role: "status" }, "Reading your Canvas…")); return; }
    if (error) {
      body.append(h("div", { class: "error", role: "alert" }, h("p", {}, error), h("button", { class: "btn", onclick: refresh }, "Try again")), viewSettings());
      return;
    }
    if (!data) return;
    const plan = L.buildPlan(data, settings);
    const ov = L.overview(data, settings);
    const now = new Date();
    const due = data.upcoming.filter((u) => !u.done && u.due && L.daysUntil(u.due, now) >= 0 && L.daysUntil(u.due, now) <= 7)
      .sort((a, b) => a.due.localeCompare(b.due));
    const missing = [...data.missing].sort((a, b) => (a.due || "").localeCompare(b.due || ""));

    if (data.demo) body.append(h("p", { class: "demo-flag" }, "Demo mode: made-up student, not real grades."));
    body.append(
      viewSummary(ov),
      viewPlan(plan, finished),
      viewList("Missing", missing, "Nothing missing. 🎉", "missing"),
      viewList("Due in the next 7 days", due, "Nothing due this week."),
      viewClasses(plan),
      h("section", { class: "tutor-cta" },
        h("h3", {}, "Stuck on something?"),
        h("p", { class: "muted" }, "The StudyPath tutor gives hints step by step, not answers."),
        h("a", { class: "btn", href: `${APP_URL}#tutor`, target: "_blank", rel: "noopener" }, "Open the AI tutor")),
      viewSettings(),
      h("p", { class: "privacy small muted" },
        "Read-only: StudyPath only reads Canvas, never changes it. Your grades stay in this browser and are not sent anywhere. ",
        `Updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`));
  }

  /* ---------- mount ---------- */
  async function mount() {
    if (!isCanvas()) return;
    settings = await loadSettings();

    const host = h("div", { id: "studypath-root" });
    host.style.cssText = "position: fixed; z-index: 2147483000; inset: auto 0 0 auto; width: 0; height: 0;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.append(h("link", { rel: "stylesheet", href: asset("panel.css") }));

    launcher = h("button", {
      class: "launcher", "aria-label": "Open StudyPath AI", "aria-controls": "sp-panel", "aria-expanded": "false",
      onclick: () => setOpen(!panel.classList.contains("open")),
    }, h("img", { src: asset("icons/icon-48.png"), alt: "" }), h("span", {}, "StudyPath"));

    body = h("div", { class: "body" });
    panel = h("aside", { class: "panel", id: "sp-panel", "aria-label": "StudyPath AI", "aria-hidden": "true" },
      h("header", {},
        h("img", { src: asset("icons/icon-48.png"), alt: "", class: "logo" }),
        h("div", { class: "brand" }, h("b", {}, "StudyPath AI"), h("span", {}, "Your study coach for Canvas")),
        h("button", { class: "icon-btn", "aria-label": "Refresh", title: "Refresh", onclick: refresh }, "↻"),
        h("button", { class: "icon-btn", "aria-label": "Close", title: "Close", onclick: () => setOpen(false) }, "✕")),
      body);

    shadow.append(launcher, panel);
    document.body.append(host);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false); });
    if (settings.open || forcedDemo) setOpen(true);

    if (hasChrome && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.demo || changes.goal || changes.minutes) {
          for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
          if (panel.classList.contains("open")) refresh(); else data = null;
        }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})(typeof globalThis !== "undefined" ? globalThis : this);
