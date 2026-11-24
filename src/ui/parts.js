// Small pieces of markup used on several screens.

import { html, fmtNum, signed, fmtDate, daysBetween, todayISO, parseISODate } from '../util.js';
import { status, classById } from '../logic/grades.js';
import { icon } from './icons.js';

export function statusPill(avg) {
  const st = status(avg);
  if (st.key === 'none') return html`<span class="pill">${st.label}</span>`;
  const ic = st.key === 'help' ? 'alert' : st.key === 'watch' ? 'info' : 'check';
  return html`<span class="pill ${st.tone}">${icon(ic)}${st.label}</span>`;
}

export function trendPill(delta, suffix = 'this month') {
  if (delta == null || Math.abs(delta) < 0.05) return html`<span class="pill">No change ${suffix}</span>`;
  const up = delta > 0;
  return html`<span class="pill ${up ? 'good' : 'bad'}">${icon(up ? 'up' : 'down')}${signed(delta, 1)} pts ${suffix}</span>`;
}

export const avgText = (v) => (v == null ? '–' : fmtNum(v, 1));

export function barFor(avg, goal, cls) {
  const st = status(avg);
  const w = avg == null ? 0 : Math.max(2, Math.min(100, avg));
  return html`<div class="bar ${st.tone === 'muted' ? '' : st.tone}" role="presentation"><i style="width:${w}%"></i>${goal ? html`<span class="goal" style="left:calc(${Math.min(100, goal)}% - 1px)" title="Goal ${goal}"></span>` : ''}</div>`;
}

export function classDot(cls) {
  return html`<span class="dot c-${cls?.color || 's1'}" aria-hidden="true"></span>`;
}

export function className(state, id) {
  return classById(state, id)?.name || 'Class';
}

export function dateChip(iso, today = todayISO()) {
  const d = parseISODate(iso);
  const days = daysBetween(today, iso);
  const tone = days <= 0 ? 'today' : days <= 3 ? 'soon' : '';
  return html`<div class="date-chip ${tone}" aria-hidden="true"><small>${d.toLocaleDateString('en-US', { month: 'short' })}</small><b>${d.getDate()}</b></div>`;
}

export function whenText(iso, today = todayISO()) {
  const n = daysBetween(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days · ${fmtDate(iso, { weekday: 'long' })}`;
  if (n >= 7) return `In ${n} days · ${fmtDate(iso, { month: 'short', day: 'numeric' })}`;
  return fmtDate(iso);
}

export function emptyState({ iconName = 'info', title, body, action }) {
  return html`<div class="empty"><div class="ic">${icon(iconName)}</div><b>${title}</b>${body ? html`<p>${body}</p>` : ''}${action || ''}</div>`;
}

export function sectionHead(title, action) {
  return html`<div class="card-head"><h2>${title}</h2>${action || ''}</div>`;
}
