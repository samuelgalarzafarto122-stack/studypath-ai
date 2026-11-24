// Shared dialogs: add/edit a grade, a test, a class, log a study session, weekly check-in.

import { store } from '../state.js';
import { html, todayISO, fmtNum, addDays } from '../util.js';
import { GRADE_TYPES, activeClasses, classById, gradeImpact, pct, WEIGHT_NOTE } from '../logic/grades.js';
import { METHODS } from '../logic/planner.js';
import { currentWeek } from '../logic/program.js';
import * as A from '../actions.js';
import { openSheet, confirmSheet, toast } from './dom.js';
import { icon } from './icons.js';

const classOptions = (state, selected) =>
  activeClasses(state).map((c) => html`<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.name}</option>`);

function needClasses() {
  if (activeClasses(store.state).length) return false;
  toast('Add a class first.', { iconName: 'info', href: '#grades', linkLabel: 'Add class' });
  return true;
}

// ---------- grades ----------
export function gradeSheet({ classId, gradeId } = {}) {
  const s = store.state;
  if (needClasses()) return;
  const g = gradeId ? store.get('grades', gradeId) : null;
  const cid = g?.classId || classId || activeClasses(s)[0].id;
  openSheet({
    title: g ? 'Edit grade' : 'Add a grade',
    body: html`
      <form class="stack" id="grade-form" novalidate>
        <div class="form-grid two">
          <label class="field"><span>Class</span><select class="input" name="classId" id="g-class">${classOptions(s, cid)}</select></label>
          <label class="field"><span>Type</span>
            <select class="input" name="type" id="g-type">
              ${Object.entries(GRADE_TYPES)
                .filter(([k]) => k !== 'start' || g?.type === 'start')
                .map(([k, v]) => html`<option value="${k}" ${(g?.type || 'quiz') === k ? 'selected' : ''}>${v.label}</option>`)}
            </select>
          </label>
        </div>
        <label class="field"><span>Name</span><input class="input" name="title" id="g-title" maxlength="80" placeholder="Quiz 3: Factoring" value="${g?.title || ''}" autocomplete="off"></label>
        <div class="form-grid three">
          <label class="field"><span>Score</span><input class="input" name="score" id="g-score" inputmode="decimal" required value="${g ? g.score : ''}" placeholder="18" autofocus></label>
          <label class="field"><span>Out of</span><input class="input" name="maxScore" id="g-max" inputmode="decimal" value="${g ? g.maxScore : 100}"></label>
          <label class="field"><span>Date</span><input class="input" type="date" name="date" id="g-date" value="${g?.date || todayISO()}" max="${addDays(todayISO(), 1)}"></label>
        </div>
        <p class="hint" id="g-preview">${WEIGHT_NOTE}</p>
        <div class="sheet-foot">
          ${g ? html`<button class="btn danger-ghost" type="button" data-sheet-action="delete">${icon('trash')}Delete</button>` : ''}
          <button class="btn secondary" type="button" data-close>Cancel</button>
          <button class="btn" type="submit">${g ? 'Save' : 'Add grade'}</button>
        </div>
      </form>`,
    onOpen(root) {
      const f = root.querySelector('form');
      const preview = root.querySelector('#g-preview');
      const update = () => {
        const score = Number(f.score.value);
        const max = Number(f.maxScore.value) || 100;
        if (!f.score.value || !Number.isFinite(score) || g) {
          preview.textContent = WEIGHT_NOTE;
          return;
        }
        const imp = gradeImpact(store.state, { classId: f.classId.value, type: f.type.value, score, maxScore: max, date: f.date.value });
        const name = classById(store.state, f.classId.value)?.name || 'This class';
        preview.textContent =
          imp.before == null
            ? `${fmtNum(imp.score, 0)}%. This will be the first grade in ${name}.`
            : `${fmtNum(imp.score, 0)}%. ${name} would go from ${fmtNum(imp.before, 1)} to ${fmtNum(imp.after, 1)}.`;
      };
      f.addEventListener('input', update);
      f.addEventListener('change', update);
    },
    actions: {
      delete: async (el, close) => {
        close();
        if (await confirmSheet({ title: 'Delete this grade?', body: `${g.title} will be removed and your average recalculated.`, confirm: 'Delete', danger: true })) {
          A.deleteGrade(g.id);
          toast('Grade deleted.');
        }
      },
    },
    onSubmit(data, form, close) {
      const score = Number(String(data.score).replace(',', '.'));
      const max = Number(String(data.maxScore || 100).replace(',', '.'));
      if (!Number.isFinite(score) || data.score === '') {
        form.score.focus();
        form.score.setCustomValidity('Enter your score');
        form.score.reportValidity();
        return;
      }
      if (!Number.isFinite(max) || max <= 0) {
        form.maxScore.focus();
        return;
      }
      const input = { classId: data.classId, type: data.type, title: data.title, score, maxScore: max, date: data.date };
      close();
      if (g) {
        A.updateGrade(g.id, input);
        toast('Grade updated.');
        return;
      }
      const { impact } = A.addGrade(input);
      const name = classById(store.state, data.classId)?.name || '';
      if (impact.before == null) toast(`${name} average: ${fmtNum(impact.after, 1)}`, { title: 'Grade added' });
      else if (impact.delta >= 0.05)
        toast(`${name} went up ${fmtNum(impact.delta, 1)} to ${fmtNum(impact.after, 1)}. Nice work!`, { title: 'Grade added', iconName: 'up' });
      else if (impact.delta <= -0.05 && !impact.isDrop && !impact.lowScore)
        toast(`${name} is now ${fmtNum(impact.after, 1)}.`, { title: 'Grade added', iconName: 'down' });
      else if (!impact.isDrop && !impact.lowScore) toast(`${name} stays at ${fmtNum(impact.after, 1)}.`, { title: 'Grade added' });
    },
  });
}

// ---------- tests ----------
export function testSheet({ classId, testId } = {}) {
  const s = store.state;
  if (needClasses()) return;
  const t = testId ? store.get('tests', testId) : null;
  const cid = t?.classId || classId || activeClasses(s)[0].id;
  openSheet({
    title: t ? 'Edit test' : 'Add an upcoming test',
    body: html`
      <form class="stack" novalidate>
        <div class="form-grid two">
          <label class="field"><span>Class</span><select class="input" name="classId" id="t-class">${classOptions(s, cid)}</select></label>
          <label class="field"><span>Date</span><input class="input" type="date" name="date" id="t-date" required min="${todayISO()}" value="${t?.date || addDays(todayISO(), 7)}"></label>
        </div>
        <label class="field"><span>What is it on?</span><input class="input" name="title" id="t-title" maxlength="80" placeholder="Quadratic equations" value="${t?.title || ''}" autofocus autocomplete="off"></label>
        <label class="field"><span>Topics (optional)</span><input class="input" name="topics" id="t-topics" maxlength="200" placeholder="Factoring, the quadratic formula" value="${t?.topics || ''}" autocomplete="off"></label>
        <p class="hint">Your plan gives this class more time as the test gets closer, and you'll get reminders 3 days before, the evening before, and that morning.</p>
        <div class="sheet-foot">
          ${t ? html`<button class="btn danger-ghost" type="button" data-sheet-action="delete">${icon('trash')}Delete</button>` : ''}
          <button class="btn secondary" type="button" data-close>Cancel</button>
          <button class="btn" type="submit">${t ? 'Save' : 'Add test'}</button>
        </div>
      </form>`,
    actions: {
      delete: (el, close) => {
        close();
        A.deleteTest(t.id);
        toast('Test removed.');
      },
    },
    onSubmit(data, form, close) {
      if (!data.date) return form.date.focus();
      close();
      if (t) {
        A.updateTest(t.id, data);
        toast('Test updated.');
      } else {
        A.addTest(data);
        toast('Your plan now makes room for it.', { title: 'Test added', iconName: 'calendar' });
      }
    },
  });
}

// ---------- classes ----------
export function classSheet({ classId } = {}) {
  const s = store.state;
  const c = classId ? classById(s, classId) : null;
  openSheet({
    title: c ? 'Edit class' : 'Add a class',
    body: html`
      <form class="stack" novalidate>
        <label class="field"><span>Class name</span><input class="input" name="name" id="c-name" required maxlength="40" placeholder="Algebra 2" value="${c?.name || ''}" autofocus autocomplete="off"></label>
        <div class="form-grid two">
          ${c
            ? ''
            : html`<label class="field"><span>Current grade % (optional)</span><input class="input" name="startGrade" id="c-start" inputmode="decimal" placeholder="74"></label>`}
          <label class="field"><span>Goal for this class</span><input class="input" name="target" id="c-target" inputmode="numeric" value="${c?.target ?? s.profile.goalAverage ?? 85}"></label>
        </div>
        <label class="field"><span>Teacher (optional)</span><input class="input" name="teacher" id="c-teacher" maxlength="40" value="${c?.teacher || ''}" autocomplete="off"></label>
        <div class="sheet-foot">
          <button class="btn secondary" type="button" data-close>Cancel</button>
          <button class="btn" type="submit">${c ? 'Save' : 'Add class'}</button>
        </div>
      </form>`,
    onSubmit(data, form, close) {
      if (!String(data.name || '').trim()) {
        form.name.focus();
        return;
      }
      close();
      if (c) {
        A.updateClass(c.id, data);
        toast('Class updated.');
      } else {
        const start = String(data.startGrade || '').replace(',', '.');
        A.addClass({ ...data, startGrade: start === '' ? null : Number(start) });
        toast(`${data.name} added.`, { title: 'New class' });
      }
    },
  });
}

// ---------- log a study session ----------
export function logSheet({ classId } = {}) {
  const s = store.state;
  if (needClasses()) return;
  openSheet({
    title: 'Log a study session',
    body: html`
      <form class="stack" novalidate>
        <div class="form-grid two">
          <label class="field"><span>Class</span><select class="input" name="classId" id="l-class">${classOptions(s, classId || activeClasses(s)[0].id)}</select></label>
          <label class="field"><span>Method</span><select class="input" name="method" id="l-method">
            ${Object.entries(METHODS)
              .filter(([k]) => k !== 'tutor')
              .map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}
          </select></label>
        </div>
        <div class="form-grid two">
          <label class="field"><span>Minutes</span><input class="input" name="minutes" id="l-min" inputmode="numeric" value="${s.settings.sessionMinutes}" required></label>
          <label class="field"><span>Date</span><input class="input" type="date" name="date" id="l-date" value="${todayISO()}" max="${todayISO()}"></label>
        </div>
        <div class="field"><span>How focused were you?</span>${focusScale('l-focus')}</div>
        <div class="sheet-foot">
          <button class="btn secondary" type="button" data-close>Cancel</button>
          <button class="btn" type="submit">Log session</button>
        </div>
      </form>`,
    onSubmit(data, form, close) {
      const minutes = Number(data.minutes);
      if (!Number.isFinite(minutes) || minutes < 1) return form.minutes.focus();
      close();
      A.logSession({ classId: data.classId, method: data.method, minutes, date: data.date, focus: data.focus ? Number(data.focus) : null, source: 'manual' });
      toast(`${minutes} minutes logged.`, { title: 'Nice work', iconName: 'flame' });
    },
  });
}

export function focusScale(name = 'focus', value) {
  const opts = [
    [1, '😵', 'Lost'],
    [2, '😕', 'Low'],
    [3, '😐', 'OK'],
    [4, '🙂', 'Good'],
    [5, '🤩', 'Locked in'],
  ];
  return html`<div class="scale" role="radiogroup">
    ${opts.map(
      ([v, e, l]) => html`<label><input type="radio" name="focus" value="${v}" ${value === v ? 'checked' : ''} aria-label="${l}" id="${name}-${v}"><span aria-hidden="true">${e}<small>${l}</small></span></label>`,
    )}
  </div>`;
}

function scale(name, labels, emojis, value) {
  return html`<div class="scale" role="radiogroup">
    ${labels.map(
      (l, i) => html`<label><input type="radio" name="${name}" value="${i + 1}" ${value === i + 1 ? 'checked' : ''} aria-label="${l}" id="ci-${name}-${i + 1}"><span aria-hidden="true">${emojis[i]}<small>${l}</small></span></label>`,
    )}
  </div>`;
}

// ---------- weekly check-in ----------
export function checkinSheet() {
  const s = store.state;
  const week = currentWeek(s);
  const existing = s.checkins.find((c) => !c.deleted && c.week === week);
  openSheet({
    title: `Week ${week} check-in`,
    body: html`
      <form class="stack loose" novalidate>
        <p class="muted">Two minutes. Your answers help your plan adapt and show how the program is going. Only you see your notes.</p>
        <div class="field"><span>How was your week overall?</span>${scale('mood', ['Rough', 'Meh', 'OK', 'Good', 'Great'], ['😣', '😕', '😐', '🙂', '😄'], existing?.mood)}</div>
        <div class="field"><span>How confident do you feel in your hardest class?</span>${scale('confidence', ['Lost', 'Shaky', 'OK', 'Pretty', 'Very'], ['😰', '😟', '😐', '😊', '💪'], existing?.confidence)}</div>
        <div class="field"><span>How stressed are you about school?</span>${scale('stress', ['Calm', 'A bit', 'Some', 'A lot', 'Too much'], ['😌', '🙂', '😐', '😥', '😫'], existing?.stress)}</div>
        <label class="field"><span>Average hours of sleep</span><input class="input" name="sleep" id="ci-sleep" inputmode="decimal" placeholder="8" value="${existing?.sleep ?? ''}"></label>
        <label class="field"><span>What worked, what didn't? (optional, private)</span><textarea class="input" name="note" id="ci-note" maxlength="500" placeholder="The timer helped. History is slipping.">${existing?.note || ''}</textarea></label>
        <div class="sheet-foot">
          <button class="btn secondary" type="button" data-close>Cancel</button>
          <button class="btn" type="submit">${existing ? 'Update check-in' : 'Save check-in'}</button>
        </div>
      </form>`,
    onSubmit(data, form, close) {
      if (!data.mood || !data.confidence || !data.stress) {
        toast('Pick one answer for each question.', { iconName: 'info' });
        return;
      }
      close();
      A.saveCheckin(data);
      const stressed = Number(data.stress) >= 4;
      toast(
        stressed
          ? 'Thanks for being honest. If stress feels like too much, talk to a school counselor or someone you trust.'
          : 'Saved. Keep it up!',
        { title: 'Check-in saved', iconName: stressed ? 'heart' : 'check', timeout: stressed ? 9000 : 4500 },
      );
    },
  });
}

export { pct };
