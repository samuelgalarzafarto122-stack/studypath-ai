// Focus timer: a countdown for one study session. A small bar stays visible on every screen while
// it runs; tapping it opens the full timer. When time is up the student rates their focus and the
// session is logged (and checked off in the plan).

import { store } from '../state.js';
import { html } from '../util.js';
import { classById } from '../logic/grades.js';
import { METHODS } from '../logic/planner.js';
import * as A from '../actions.js';
import { notify } from '../notify.js';
import { openSheet, toast } from './dom.js';
import { focusScale } from './forms.js';
import { icon } from './icons.js';

let sheet = null; // open timer dialog
let doneFor = null; // timer id we already announced

const mmss = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const TIPS = {
  review: 'Read one section, close the notes, then do practice problems without looking.',
  practice: 'Treat it like the real test: no notes, no phone, keep time.',
  recall: 'Blank page: write everything you remember, then check your notes and fill the gaps in another color.',
  flashcards: 'Say the answer out loud before you flip. Put the ones you miss in a "again" pile.',
  mistakes: 'Redo problems you got wrong. For each one, write WHY it went wrong in one line.',
  teach: 'Explain it out loud like you are teaching a friend. Where you get stuck is what to review.',
  tutor: 'Open the tutor and work through one problem you got wrong. Ask for hints, not answers.',
  custom: 'Phone face down in another room. One task at a time.',
};

function label(t) {
  const cls = classById(store.state, t.classId);
  return t.title || `${METHODS[t.method]?.label || 'Study'}${cls ? `: ${cls.name}` : ''}`;
}

export function renderTimerBar(slot) {
  if (!slot) return;
  const t = store.state.timer;
  if (!t || sheet) {
    slot.innerHTML = '';
    return;
  }
  const left = A.timerRemaining(t);
  slot.innerHTML = String(html`<div class="timer-bar" role="region" aria-label="Focus timer">
    ${icon('clock')}
    <div class="grow"><div class="t" data-timer-left>${mmss(left)}</div><div class="tiny ellipsis" style="opacity:.8">${t.pausedAt ? 'Paused · ' : ''}${label(t)}</div></div>
    <button class="btn small" type="button" data-action="open-timer">Open</button>
  </div>`);
}

function faceHTML(t) {
  const left = A.timerRemaining(t);
  const total = t.minutes * 60000;
  const C = 2 * Math.PI * 54;
  const off = C * (left / total);
  const cls = classById(store.state, t.classId);
  return html`
    <div class="timer-face">
      <div class="pill accent">${cls ? cls.name : 'Study session'} · ${t.minutes} min</div>
      <div class="ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="prog" cx="60" cy="60" r="54" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C - off).toFixed(1)}" data-ring/></svg>
        <div class="lbl"><b data-timer-big aria-live="off">${mmss(left)}</b><small>${t.pausedAt ? 'Paused' : 'left'}</small></div>
      </div>
      <div class="strong">${label(t)}</div>
      <p class="muted small" style="max-width:40ch">${TIPS[t.method] || TIPS.custom}</p>
    </div>`;
}

export function openTimer() {
  const t = store.state.timer;
  if (!t) return;
  if (sheet) sheet.close();
  const s = openSheet({
    title: 'Focus timer',
    body: html`<div data-face>${faceHTML(t)}</div>`,
    foot: html`
      <button class="btn danger-ghost" type="button" data-sheet-action="cancel">${icon('x')}Cancel</button>
      <button class="btn secondary" type="button" data-sheet-action="pause" data-pause>${t.pausedAt ? html`${icon('play')}Resume` : html`${icon('pause')}Pause`}</button>
      <button class="btn" type="button" data-sheet-action="finish">${icon('check')}I'm done</button>`,
    actions: {
      pause: (el) => {
        const cur = store.state.timer;
        if (!cur) return;
        if (cur.pausedAt) A.resumeTimer();
        else A.pauseTimer();
        refreshSheet();
      },
      cancel: (el, close) => {
        A.cancelTimer();
        close();
        toast('Timer cancelled. Nothing was logged.', { iconName: 'info' });
      },
      finish: (el, close) => {
        close();
        finishSheet();
      },
    },
    onClose: () => {
      sheet = null;
      renderTimerBar(document.getElementById('timer-slot'));
    },
  });
  sheet = s;
  renderTimerBar(document.getElementById('timer-slot'));
}

function refreshSheet() {
  const t = store.state.timer;
  if (!sheet || !t) return;
  const face = sheet.root.querySelector('[data-face]');
  if (face) face.innerHTML = String(faceHTML(t));
  const p = sheet.root.querySelector('[data-pause]');
  if (p) p.innerHTML = String(t.pausedAt ? html`${icon('play')}Resume` : html`${icon('pause')}Pause`);
}

export function finishSheet() {
  const t = store.state.timer;
  if (!t) return;
  const mins = Math.max(0, Math.min(t.minutes, Math.round(A.timerElapsed(t) / 60000)));
  openSheet({
    title: mins >= t.minutes ? 'Session complete! 🎉' : 'Finish session',
    body: html`
      <form class="stack" novalidate>
        <p>${mins < 1 ? 'Less than a minute so far, so there is nothing to log yet.' : html`You studied <b>${mins} minute${mins === 1 ? '' : 's'}</b>. How focused were you?`}</p>
        ${mins >= 1 ? focusScale('fin-focus') : ''}
        <p class="hint">Focus ratings help find your best time of day to study.</p>
        <div class="sheet-foot">
          ${mins < 1 ? html`<button class="btn secondary" type="button" data-sheet-action="resume">Keep going</button>` : ''}
          <button class="btn" type="submit">${mins < 1 ? 'Stop without logging' : 'Save session'}</button>
        </div>
      </form>`,
    actions: {
      resume: (el, close) => {
        close();
        openTimer();
      },
    },
    onSubmit(data, form, close) {
      close();
      const res = A.finishTimer({ focus: data.focus ? Number(data.focus) : null });
      if (res) toast(`${res.minutes} minutes logged.`, { title: 'Nice work!', iconName: 'flame' });
    },
  });
}

/** Called every second by main.js. */
export function tickTimer() {
  const t = store.state.timer;
  if (!t) return;
  const left = A.timerRemaining(t);
  const txt = mmss(left);
  for (const el of document.querySelectorAll('[data-timer-left], [data-timer-big]')) el.textContent = txt;
  const ring = document.querySelector('[data-ring]');
  if (ring) {
    const C = 2 * Math.PI * 54;
    ring.setAttribute('stroke-dashoffset', (C - C * (left / (t.minutes * 60000))).toFixed(1));
  }
  if (left <= 0 && doneFor !== t.id) {
    doneFor = t.id;
    notify({ type: 'study', key: `timer:${t.id}`, title: 'Time is up! ⏰', body: `${label(t)}. Take a 5-minute break, then rate your focus.`, url: '#plan' });
    if (sheet) sheet.close();
    finishSheet();
  }
}
