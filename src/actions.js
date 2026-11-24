// Everything the student can do, in one place. Views call these. Each one updates the store
// (which saves on the device and, with permission, syncs to the cloud) and runs the side effects
// the student expects: refreshing the study plan, grade alerts, notifications and small
// analytics events for the research dashboard.

import { store } from './state.js';
import { idbGet, idbSet, idbDel } from './idb.js';
import { uid, nowISO, todayISO, addMinutesHHMM, fmtNum, clamp, nowHHMM, daysBetween, round1 } from './util.js';
import { GRADE_TYPES, activeClasses, classById, gradeImpact, nextClassColor, pct } from './logic/grades.js';
import { buildPlan, planBasis, METHODS, sessionTitle } from './logic/planner.js';
import { currentWeek, weekInfo } from './logic/program.js';
import { buildSampleState } from './logic/sample.js';
import { tutorDate } from './logic/stats.js';
import { classify, respond, startsNewRecord, newTutorRecord, currentProblem } from './tutor/engine.js';
import { revealsAnswer } from './tutor/problems.js';
import { LOCAL_ONLY, appNote, buildTurns, guardReply, detectProvider, aiErrorNote } from './tutor/ai.js';
import { notify } from './notify.js';

/** Set by main.js so this file does not depend on the cloud code. */
export const hooks = {
  cloudTutor: null, // () => provider | null
  beforeWipe: null, // async () => void (delete cloud copy)
};

const clean = (v, max = 80) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);
const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

// ---------- analytics events ----------
/** Small, non-identifying usage events (no free text). */
export function track(type, data = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    if (typeof v === 'number') safe[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'boolean') safe[k] = v;
    else safe[k] = String(v).slice(0, 40);
  }
  store.add('events', { type, date: todayISO(), at: nowISO(), data: safe }, { silent: true });
}

// ---------- onboarding & demo ----------
export function completeOnboarding({ nickname, gradeLevel, goalAverage, consent = {}, classes = [], settings = {} }) {
  const s = store.state;
  const t = nowISO();
  Object.assign(s.profile, {
    nickname: clean(nickname, 24),
    gradeLevel: clean(gradeLevel, 4) || '10',
    goalAverage: num(goalAverage, 60, 100, 85),
    updatedAt: t,
  });
  Object.assign(s.consent, {
    privacy: Boolean(consent.privacy),
    ageOk: Boolean(consent.ageOk),
    cloud: Boolean(consent.cloud),
    research: Boolean(consent.cloud && consent.research),
    tutorText: false,
    at: t,
    updatedAt: t,
  });
  const { notifications, ...rest } = settings;
  Object.assign(s.settings, rest, { updatedAt: t });
  if (notifications) s.settings.notifications = { ...s.settings.notifications, ...notifications };
  s.program = { startDate: todayISO(), lessonsDone: {}, reflections: {}, updatedAt: t };
  for (const c of classes) if (clean(c.name)) addClass(c, { silent: true });
  s.onboarded = true;
  s.demo = false;
  for (const k of ['profile', 'consent', 'settings', 'program']) store.markDirty(k, 'me');
  store.commit({ onboarded: true });
  refreshPlan();
  track('onboarded', { classes: classes.length, cloud: s.consent.cloud, research: s.consent.research });
}

/** Load "Alex", the sample student. The student's own data is kept aside and comes back on exit. */
export async function enterDemo() {
  const s = store.state;
  if (s.onboarded && !s.demo) await idbSet('backup', JSON.parse(JSON.stringify(s)));
  const next = buildSampleState();
  next.settings.theme = s.settings.theme;
  store.replaceAll(next);
  refreshPlan();
}

export function resetDemo() {
  const theme = store.state.settings.theme;
  const next = buildSampleState();
  next.settings.theme = theme;
  store.replaceAll(next);
  refreshPlan();
}

/** Leave the demo: restore the student's own data, or go back to the welcome screen. */
export async function exitDemo() {
  const backup = await idbGet('backup');
  if (backup && backup.v) {
    store.replaceAll(backup);
    await idbDel('backup');
    refreshPlan();
  } else {
    await store.wipe();
  }
}

export async function hasBackup() {
  const b = await idbGet('backup');
  return Boolean(b && b.v);
}

// ---------- classes ----------
export function addClass({ name, target, teacher, startGrade } = {}, { silent = false } = {}) {
  const s = store.state;
  const cls = store.add(
    'classes',
    {
      name: clean(name, 40) || 'Class',
      target: num(target, 50, 100, s.profile.goalAverage || 85),
      teacher: clean(teacher, 40),
      color: nextClassColor(s),
      order: activeClasses(s).length,
    },
    { silent: true },
  );
  if (startGrade !== '' && startGrade != null && Number.isFinite(Number(startGrade))) {
    store.add(
      'grades',
      { classId: cls.id, type: 'start', title: 'Starting grade', score: num(startGrade, 0, 150, 0), maxScore: 100, date: todayISO() },
      { silent: true },
    );
  }
  if (!silent) {
    store.commit({ coll: 'classes', id: cls.id, op: 'add' });
    refreshPlan();
  }
  return cls;
}

export function updateClass(id, patch) {
  const p = {};
  if ('name' in patch) p.name = clean(patch.name, 40) || 'Class';
  if ('target' in patch) p.target = num(patch.target, 50, 100, 85);
  if ('teacher' in patch) p.teacher = clean(patch.teacher, 40);
  const rec = store.patch('classes', id, p);
  refreshPlan();
  return rec;
}

/** Remove a class and everything attached to it (kept as soft deletes so the cloud copy follows). */
export function deleteClass(id) {
  const s = store.state;
  const t = nowISO();
  for (const coll of ['grades', 'tests']) {
    for (const r of s[coll]) {
      if (r.classId === id && !r.deleted) {
        r.deleted = true;
        r.updatedAt = t;
        store.markDirty(coll, r.id);
      }
    }
  }
  store.remove('classes', id);
  refreshPlan();
}

// ---------- grades ----------
function normalizeGrade(input) {
  const type = GRADE_TYPES[input.type] ? input.type : 'homework';
  const maxScore = num(input.maxScore, 1, 1000, 100);
  return {
    classId: input.classId,
    type,
    title: clean(input.title, 80) || GRADE_TYPES[type].label,
    score: num(input.score, 0, maxScore * 1.5, 0),
    maxScore,
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : todayISO(),
  };
}

/**
 * Save a grade. Returns { grade, impact } so the screen can show what it did to the average.
 * A recent grade that lowers the class average (or is under 70%) sends a grade alert.
 */
export function addGrade(input) {
  const s = store.state;
  const g = normalizeGrade(input);
  const impact = gradeImpact(s, g);
  const rec = store.add('grades', g);
  const cls = classById(s, g.classId);
  track('grade_added', {
    type: g.type,
    score: pct(g),
    delta: impact.delta,
    drop: impact.isDrop,
  });
  const recent = daysBetween(g.date, todayISO()) <= 14;
  if (cls && recent && (impact.isDrop || impact.lowScore)) gradeAlert(cls, rec, impact);
  refreshPlan();
  return { grade: rec, impact };
}

function gradeAlert(cls, g, impact) {
  const score = fmtNum(impact.score, 0);
  let title;
  let body;
  if (impact.isDrop) {
    const pts = fmtNum(Math.abs(impact.delta), 1);
    title = `${cls.name} dropped to ${fmtNum(impact.after, 1)}`;
    body = `${g.title} (${score}%) lowered your average by ${pts} point${pts === '1' ? '' : 's'}.`;
    if (impact.statusDown) body += ` It moved from ${impact.statusBefore.label} to ${impact.statusAfter.label}.`;
    body += ` Your study plan will give ${cls.name} more time.`;
  } else {
    title = `Low score in ${cls.name}: ${score}%`;
    body = `${g.title}. One grade doesn't define you. Ask the tutor to go over what went wrong.`;
  }
  notify({ type: 'grades', key: `grade:${g.id}`, title, body, url: `#class-${cls.id}` });
}

export function updateGrade(id, patch) {
  const cur = store.get('grades', id);
  if (!cur) return null;
  const next = normalizeGrade({ ...cur, ...patch });
  const rec = store.patch('grades', id, next);
  refreshPlan();
  return rec;
}

export function deleteGrade(id) {
  store.remove('grades', id);
  refreshPlan();
}

// ---------- tests ----------
export function addTest({ classId, title, date, topics }) {
  const rec = store.add('tests', {
    classId,
    title: clean(title, 80) || 'Test',
    topics: clean(topics, 200),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayISO(),
  });
  track('test_added', { daysAway: daysBetween(todayISO(), rec.date) });
  refreshPlan();
  return rec;
}

export function updateTest(id, patch) {
  const p = {};
  if ('title' in patch) p.title = clean(patch.title, 80) || 'Test';
  if ('topics' in patch) p.topics = clean(patch.topics, 200);
  if ('date' in patch && /^\d{4}-\d{2}-\d{2}$/.test(patch.date)) p.date = patch.date;
  if ('classId' in patch) p.classId = patch.classId;
  const rec = store.patch('tests', id, p);
  refreshPlan();
  return rec;
}

export function deleteTest(id) {
  store.remove('tests', id);
  refreshPlan();
}

// ---------- study plan ----------
function retime(sessions, from) {
  let t = from;
  return sessions.map((x) => {
    const out = { ...x, start: t };
    t = addMinutesHHMM(t, (x.minutes || 25) + 5);
    return out;
  });
}

/**
 * Make sure the day has a plan that matches the latest grades, tests and settings.
 * Finished sessions are never touched; the unfinished part is re-planned. Plans the student
 * edited by hand are left alone.
 */
export function refreshPlan(date = todayISO(), { force = false } = {}) {
  const s = store.state;
  if (!s.onboarded) return null;
  const saved = s.plans[date];
  const basis = planBasis(s, date);
  if (saved && !force && (saved.basis === basis || saved.edited)) return saved;
  const fresh = buildPlan(s, date);
  const done = (saved?.sessions || []).filter((x) => x.done);
  if (!done.length) return store.setPlan(date, fresh);
  const last = done[done.length - 1];
  const rest = fresh.sessions.slice(done.length);
  const from = addMinutesHHMM(last.start || s.settings.studyTime, (last.minutes || 25) + 5);
  return store.setPlan(date, { ...fresh, rest: false, empty: false, sessions: [...done, ...retime(rest, from)] });
}

export function rebuildPlan(date = todayISO()) {
  const saved = store.state.plans[date];
  if (saved) saved.edited = false;
  return refreshPlan(date, { force: true });
}

/** Mark a planned session done (logs it) or not done (removes the log). */
export function setPlanSessionDone(date, sessId, done, { focus = null, minutes } = {}) {
  const plan = store.state.plans[date];
  const sess = plan?.sessions?.find((x) => x.id === sessId);
  if (!sess) return null;
  const sessions = plan.sessions.map((x) => ({ ...x }));
  const target = sessions.find((x) => x.id === sessId);
  if (done && !target.done) {
    const log = logSession(
      { classId: sess.classId, method: sess.method, minutes: minutes ?? sess.minutes, title: sess.title, date, focus, planSessionId: sess.id, source: 'plan' },
      { silent: true },
    );
    target.done = true;
    target.logId = log.id;
    target.focus = focus;
  } else if (!done && target.done) {
    if (target.logId && store.get('sessions', target.logId)) store.remove('sessions', target.logId);
    target.done = false;
    target.logId = null;
  }
  return store.setPlan(date, { ...plan, sessions });
}

export function addPlanSession(date, { classId, method = 'review', minutes, title }) {
  const s = store.state;
  const plan = s.plans[date] || refreshPlan(date) || { date, sessions: [] };
  const cls = classById(s, classId);
  const L = num(minutes, 5, 120, s.settings.sessionMinutes || 25);
  const last = plan.sessions[plan.sessions.length - 1];
  const start = last ? addMinutesHHMM(last.start, (last.minutes || 25) + 5) : s.settings.studyTime;
  const sess = {
    id: uid(),
    classId,
    method: METHODS[method] ? method : 'custom',
    minutes: L,
    start,
    title: clean(title, 80) || sessionTitle(method, cls ? `${cls.name}` : 'your class'),
    done: false,
    custom: true,
  };
  return store.setPlan(date, { ...plan, rest: false, empty: false, edited: true, sessions: [...plan.sessions, sess] });
}

export function removePlanSession(date, sessId) {
  const plan = store.state.plans[date];
  if (!plan) return null;
  return store.setPlan(date, { ...plan, edited: true, sessions: plan.sessions.filter((x) => x.id !== sessId) });
}

// ---------- study sessions & focus timer ----------
export function logSession(
  { classId, method = 'custom', minutes, title, date = todayISO(), startTime, focus = null, source = 'manual', planSessionId = null },
  { silent = false } = {},
) {
  const s = store.state;
  const cls = classById(s, classId);
  const mins = Math.round(num(minutes, 1, 300, 25));
  const rec = store.add(
    'sessions',
    {
      classId,
      method: METHODS[method] ? method : 'custom',
      minutes: mins,
      title: clean(title, 80) || sessionTitle(method, cls ? cls.name : 'Study'),
      date,
      startTime: startTime || nowHHMM(),
      focus: focus == null ? null : num(focus, 1, 5, 3),
      source,
      planSessionId,
    },
    { silent },
  );
  track('session_done', { method, minutes: mins, source, focus: rec.focus });
  return rec;
}

export function startTimer({ classId, method = 'custom', minutes, title, planDate = null, planSessionId = null }) {
  const s = store.state;
  const L = num(minutes, 1, 120, s.settings.sessionMinutes || 25);
  store.setLocal('timer', {
    id: uid(),
    classId,
    method,
    minutes: L,
    title: clean(title, 80),
    planDate,
    planSessionId,
    date: todayISO(),
    startTime: nowHHMM(),
    startedAt: Date.now(),
    pausedAt: null,
    pausedMs: 0,
  });
  track('timer_start', { method, minutes: L });
}

export function timerElapsed(t, now = Date.now()) {
  if (!t) return 0;
  const paused = t.pausedMs + (t.pausedAt ? now - t.pausedAt : 0);
  return Math.max(0, now - t.startedAt - paused);
}

export function timerRemaining(t, now = Date.now()) {
  if (!t) return 0;
  return Math.max(0, t.minutes * 60000 - timerElapsed(t, now));
}

export function pauseTimer() {
  const t = store.state.timer;
  if (!t || t.pausedAt) return;
  store.setLocal('timer', { ...t, pausedAt: Date.now() });
}

export function resumeTimer() {
  const t = store.state.timer;
  if (!t || !t.pausedAt) return;
  store.setLocal('timer', { ...t, pausedMs: t.pausedMs + (Date.now() - t.pausedAt), pausedAt: null });
}

export function cancelTimer() {
  if (store.state.timer) track('timer_cancel', {});
  store.setLocal('timer', null);
}

/** Stop the timer and log the minutes actually studied (at least 1). */
export function finishTimer({ focus = null } = {}) {
  const t = store.state.timer;
  if (!t) return null;
  const minutes = Math.min(t.minutes, Math.round(timerElapsed(t) / 60000));
  store.setLocal('timer', null);
  if (minutes < 1) return null;
  const plan = t.planDate ? store.state.plans[t.planDate] : null;
  if (plan && plan.sessions.some((x) => x.id === t.planSessionId && !x.done)) {
    setPlanSessionDone(t.planDate, t.planSessionId, true, { focus, minutes });
    return { minutes };
  }
  logSession({ classId: t.classId, method: t.method, minutes, title: t.title, date: t.date, startTime: t.startTime, focus, source: 'timer' });
  return { minutes };
}

export function deleteSession(id) {
  const rec = store.get('sessions', id);
  if (!rec) return;
  store.remove('sessions', id);
  if (rec.planSessionId) {
    const plan = store.state.plans[rec.date];
    const sess = plan?.sessions?.find((x) => x.id === rec.planSessionId);
    if (sess && sess.done) {
      store.setPlan(rec.date, { ...plan, sessions: plan.sessions.map((x) => (x.id === sess.id ? { ...x, done: false, logId: null } : x)) });
    }
  }
}

// ---------- weekly check-in & program ----------
export function saveCheckin({ mood, confidence, stress, sleep, note }) {
  const s = store.state;
  const week = currentWeek(s);
  const data = {
    week,
    date: todayISO(),
    mood: num(mood, 1, 5, 3),
    confidence: num(confidence, 1, 5, 3),
    stress: num(stress, 1, 5, 3),
    sleep: sleep === '' || sleep == null ? null : num(sleep, 0, 14, null),
    note: clean(note, 500),
  };
  const existing = s.checkins.find((c) => !c.deleted && c.week === week);
  const rec = existing ? store.patch('checkins', existing.id, data) : store.add('checkins', data);
  track('checkin', { week, mood: data.mood, confidence: data.confidence, stress: data.stress });
  return rec;
}

export function setLessonDone(n, done = true) {
  const s = store.state;
  store.setSingle('program', { lessonsDone: { ...s.program.lessonsDone, [n]: Boolean(done) } });
  if (done) track('lesson_done', { week: n });
}

export function saveReflection(n, text) {
  const s = store.state;
  store.setSingle('program', { reflections: { ...s.program.reflections, [n]: clean(text, 1000) } });
}

export function restartProgram(startDate = todayISO()) {
  store.setSingle('program', { startDate, lessonsDone: {}, reflections: {} });
  refreshPlan();
}

// ---------- profile, settings, consent ----------
export function updateProfile(patch) {
  const p = {};
  if ('nickname' in patch) p.nickname = clean(patch.nickname, 24);
  if ('gradeLevel' in patch) p.gradeLevel = clean(patch.gradeLevel, 4);
  if ('goalAverage' in patch) p.goalAverage = num(patch.goalAverage, 60, 100, 85);
  if ('avatar' in patch) p.avatar = clean(patch.avatar, 12);
  store.setSingle('profile', p);
  if ('goalAverage' in p) refreshPlan();
}

export function updateSettings(patch) {
  const s = store.state;
  const p = { ...patch };
  if (patch.notifications) p.notifications = { ...s.settings.notifications, ...patch.notifications };
  if ('sessionMinutes' in p) p.sessionMinutes = num(p.sessionMinutes, 10, 60, 25);
  if ('dailyMinutes' in p) p.dailyMinutes = num(p.dailyMinutes, 10, 240, 50);
  store.setSingle('settings', p);
  if (['studyDays', 'studyTime', 'sessionMinutes', 'dailyMinutes'].some((k) => k in p)) refreshPlan();
}

export function updateConsent(patch) {
  const p = {};
  for (const k of ['privacy', 'ageOk', 'cloud', 'research', 'tutorText', 'teacherReport', 'parentAlerts']) if (k in patch) p[k] = Boolean(patch[k]);
  if (p.cloud === false) {
    p.research = false;
    p.tutorText = false;
  }
  if (p.research === false) p.tutorText = false;
  store.setSingle('consent', p);
  track('consent', { cloud: store.state.consent.cloud, research: store.state.consent.research });
}

// ---------- inbox ----------
export function markInboxRead(id) {
  const inbox = store.state.inbox.map((n) => (id == null || n.id === id ? { ...n, read: true } : n));
  store.setLocal('inbox', inbox);
}

export function clearInbox() {
  store.setLocal('inbox', []);
}

// ---------- tutor ----------
const MAX_MESSAGES = 80;

/** Conversations grouped by chat (one chat can hold several problems, one record each). */
export function tutorChats(state) {
  const groups = new Map();
  for (const r of state.tutor) {
    if (r.deleted) continue;
    const key = r.chatId || r.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const chats = [];
  for (const [chatId, records] of groups) {
    records.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    const last = records[records.length - 1];
    const lastAt = last.messages?.length ? last.messages[last.messages.length - 1].at : last.updatedAt;
    chats.push({
      chatId,
      records,
      classId: records[0].classId,
      title: records.find((r) => r.kind !== 'chat')?.title || records[0].title,
      date: tutorDate(records[0]),
      lastAt,
      solved: records.filter((r) => r.solved).length,
      problems: records.filter((r) => r.kind === 'problem').length,
    });
  }
  return chats.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

function latestRecord(chatId) {
  return (
    store
      .list('tutor')
      .filter((r) => (r.chatId || r.id) === chatId)
      .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))
      .pop() || null
  );
}

function needsNewRecord(rec, analysis) {
  if (startsNewRecord(rec, analysis)) return true;
  return analysis.intent === 'quiz' && Boolean(rec.problem || rec.concept);
}

/** A fresh record for the next problem in the same chat, keeping the practice level and topic. */
function carryOver(prev) {
  const next = { ...newTutorRecord({ classId: prev.classId }), chatId: prev.chatId || prev.id, level: prev.level || 1, date: todayISO() };
  if (prev.concept) next.concept = { id: prev.concept.id, step: 99, mode: 'done', quizIndex: 0, correct: 0 };
  return next;
}

async function askAI(provider, rec, text, analysis, local, { subject, signal, onPartial }) {
  const s = store.state;
  const habit = weekInfo(currentWeek(s))?.habit;
  const ctx = { nickname: s.profile.nickname, subject, habit, grade: s.profile.gradeLevel };
  const turns = buildTurns(rec, text, appNote(rec, analysis, local), ctx);
  const prob = currentProblem(rec);
  const guardOn = Boolean(prob && !rec.problem?.solved);
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  let leakedEarly = false;
  try {
    const out = await provider.call(turns, {
      signal: ctrl.signal,
      onText: ({ text: partial } = {}) => {
        if (leakedEarly || !partial) return;
        if (guardOn && revealsAnswer(partial, prob)) {
          leakedEarly = true;
          ctrl.abort();
          return;
        }
        onPartial?.(partial);
      },
    });
    if (leakedEarly) throw Object.assign(new Error('leak'), { code: 'leak' });
    const textOut = String(out || '').trim();
    if (!textOut) throw Object.assign(new Error('empty'), { code: 'empty' });
    return guardReply(textOut, rec, local.reply);
  } catch (e) {
    if (leakedEarly) return { text: `${local.reply}\n\n_(I almost gave away the answer, so here's a hint instead.)_`, leaked: true };
    throw e;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}

/**
 * Send a message to the tutor. The built-in engine always decides (hint level, answer check,
 * safety); a real AI, when available and allowed, rewrites the reply in its own words.
 * Returns { chatId, record, reply, engine, note, leaked, events }.
 */
export async function sendTutorMessage({ chatId = null, text, classId = null, signal, onPartial } = {}) {
  const s = store.state;
  const body = clean(text, 1000);
  if (!body) return null;
  const prev = chatId ? latestRecord(chatId) : null;
  let work = prev ? structuredClone(prev) : { ...newTutorRecord({ classId }), chatId: chatId || uid(), date: todayISO() };
  let analysis = classify(work, body);
  let isNew = !prev;
  if (prev && needsNewRecord(work, analysis)) {
    work = carryOver(prev);
    analysis = classify(work, body);
    isNew = true;
  }
  if (isNew) delete work.id;

  const cls = classById(s, work.classId);
  const subject = cls?.name || '';
  const local = respond(work, body, { subject, nickname: s.profile.nickname }, analysis);
  work.messages = [...(work.messages || []), { role: 'user', text: body, at: nowISO() }];
  if (work.kind === 'chat' && (!work.title || work.title === 'New conversation')) work.title = body.slice(0, 60);

  let reply = local.reply;
  let engine = 'built-in';
  let note = '';
  let leaked = false;
  if (s.settings.tutorEngine !== 'built-in' && !LOCAL_ONLY.has(analysis.intent)) {
    const provider = await detectProvider(hooks.cloudTutor ? hooks.cloudTutor() : null);
    if (provider) {
      try {
        const out = await askAI(provider, work, body, analysis, local, { subject, signal, onPartial });
        reply = out.text;
        leaked = out.leaked;
        engine = provider.name;
      } catch (e) {
        note = aiErrorNote(e);
      }
    }
  }

  const msg = { role: 'tutor', text: reply, at: nowISO(), engine };
  if (local.events.hint) msg.hintLevel = work.problem?.hintIndex || 1;
  if (local.events.safety) msg.safety = true;
  if (local.events.solved) msg.solved = true;
  if (note) msg.note = note;
  work.messages.push(msg);
  if (work.messages.length > MAX_MESSAGES) work.messages = work.messages.slice(-MAX_MESSAGES);
  if (engine !== 'built-in') work.engine = engine;
  work.date = work.date || todayISO();

  const record = isNew ? store.add('tutor', work) : store.patch('tutor', prev.id, work);
  track('tutor_message', { intent: analysis.intent, engine, hint: Boolean(local.events.hint), solved: Boolean(local.events.solved), leaked });
  return { chatId: work.chatId, record, reply, engine, note, leaked, events: local.events, intent: analysis.intent };
}

export function deleteChat(chatId) {
  for (const r of store.list('tutor')) if ((r.chatId || r.id) === chatId) store.remove('tutor', r.id);
}

// ---------- export & delete ----------
const EXPORT_KEYS = ['profile', 'consent', 'settings', 'program', 'classes', 'grades', 'tests', 'sessions', 'tutor', 'checkins', 'events', 'plans'];

export function exportData() {
  const s = store.state;
  const data = {};
  for (const k of EXPORT_KEYS) {
    const v = s[k];
    data[k] = Array.isArray(v) ? v.filter((r) => !r.deleted) : v;
  }
  return { app: 'StudyPath AI', schema: s.v, exportedAt: nowISO(), demo: s.demo, data };
}

const csvCell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export function exportCSV(kind) {
  const s = store.state;
  const name = (id) => classById(s, id)?.name || '';
  const live = (k) => s[k].filter((r) => !r.deleted);
  switch (kind) {
    case 'grades':
      return csv([
        ['date', 'class', 'type', 'title', 'score', 'max_score', 'percent'],
        ...live('grades')
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((g) => [g.date, name(g.classId), g.type, g.title, g.score, g.maxScore, round1(pct(g))]),
      ]);
    case 'sessions':
      return csv([
        ['date', 'start_time', 'class', 'method', 'minutes', 'focus_1_to_5', 'source'],
        ...live('sessions')
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((x) => [x.date, x.startTime, name(x.classId), x.method, x.minutes, x.focus ?? '', x.source || '']),
      ]);
    case 'tutor':
      return csv([
        ['date', 'class', 'kind', 'title', 'hints_used', 'solved', 'engine', 'messages'],
        ...live('tutor').map((t) => [tutorDate(t), name(t.classId), t.kind, t.title, t.hintsUsed || 0, t.solved ? 1 : 0, t.engine || '', t.messages?.length || 0]),
      ]);
    case 'checkins':
      return csv([
        ['week', 'date', 'mood_1_to_5', 'confidence_1_to_5', 'stress_1_to_5', 'sleep_hours', 'note'],
        ...live('checkins').map((c) => [c.week, c.date, c.mood, c.confidence, c.stress, c.sleep ?? '', c.note || '']),
      ]);
    default:
      return '';
  }
}

/** Replace this device's data with an exported file. */
export function importData(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  const d = obj?.data;
  if (!d || !d.profile || !Array.isArray(d.classes)) throw new Error('This file is not a StudyPath export.');
  const next = { ...store.state, ...d, onboarded: true, demo: Boolean(obj.demo), inbox: [], timer: null };
  next.sync = { ...store.state.sync, dirty: {} };
  store.replaceAll(next);
  store.markAllDirty();
  refreshPlan();
}

/** Delete everything: the cloud copy (if any) first, then this device. */
export async function deleteAllData() {
  if (hooks.beforeWipe) await hooks.beforeWipe();
  await idbDel('backup');
  await store.wipe();
}
