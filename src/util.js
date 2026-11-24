// Small helpers shared by every module.
// Nothing in this file touches the DOM, so the logic modules that use it can be unit-tested in Node.

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const nowISO = () => new Date().toISOString();

// ---------- Dates ----------
// Calendar dates are stored as local "YYYY-MM-DD" strings. Never use new Date("YYYY-MM-DD"):
// browsers read that as UTC midnight, which is the previous day in the Americas.

export const pad2 = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISODate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const todayISO = (now = new Date()) => toISODate(now);

/** Local calendar date of a timestamp (ISO string or ms). */
export const localDateOf = (ts) => toISODate(new Date(ts));

/** Current local time as HH:MM. */
export function nowHHMM(now = new Date()) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). Rounding absorbs daylight-saving hours. */
export function daysBetween(aIso, bIso) {
  return Math.round((parseISODate(bIso) - parseISODate(aIso)) / 86400000);
}

/** 0 = Sunday ... 6 = Saturday */
export const weekday = (iso) => parseISODate(iso).getDay();

/** Monday of the week that contains iso. */
export function startOfWeekISO(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

export function parseHHMM(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/** A Date for a calendar day at a wall-clock time ("17:30"). */
export function atTime(iso, hhmm) {
  const { h, m } = parseHHMM(hhmm);
  const d = parseISODate(iso);
  d.setHours(h, m, 0, 0);
  return d;
}

export function addMinutesHHMM(hhmm, minutes) {
  const { h, m } = parseHHMM(hhmm);
  let t = h * 60 + m + minutes;
  t = ((t % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

export function minutesOfDay(hhmm) {
  const { h, m } = parseHHMM(hhmm);
  return h * 60 + m;
}

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseISODate(iso).toLocaleDateString('en-US', opts);
}

/** "17:05" -> "5:05 PM" */
export function fmtTime(hhmm) {
  const { h, m } = parseHHMM(hhmm);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

export function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

export function fmtAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function fmtMinutes(min, { short = false } = {}) {
  const m = Math.round(min);
  if (short) return m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// ---------- Numbers & arrays ----------
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10;
export const sum = (a) => a.reduce((s, v) => s + v, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : null);

export function groupBy(arr, keyFn) {
  const out = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

export function fmtNum(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '–';
  return Number(v).toFixed(digits).replace(/\.0+$/, '');
}

export function signed(v, digits = 1) {
  if (v == null) return '–';
  const s = fmtNum(Math.abs(v), digits);
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + s;
}

/** Stable small hash of any JSON-able value (used to notice when plan inputs change). */
export function hashOf(value) {
  const str = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

// ---------- HTML ----------
// html`...` escapes every interpolated value unless it is wrapped in raw() or is itself html`...`.
// This keeps student-typed text (nicknames, class names, chat) from ever being run as markup.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(String(s ?? ''));

function renderValue(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += renderValue(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/** Light formatting for tutor messages: escapes everything, then allows **bold**, `code` and line breaks. */
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
/** "x^2 + 3x" → "x² + 3x" for titles and short labels (plain text, no HTML). */
export const prettyMath = (text) => String(text ?? '').replace(/\^(\d{1,2})(?!\d)/g, (_, d) => [...d].map((c) => SUP[c]).join(''));

export function richText(text) {
  let s = esc(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
  s = s.replace(/([a-z0-9)\]])\^(\d{1,2})(?![\d.])/gi, '$1<sup>$2</sup>');
  s = s.replace(/\n/g, '<br>');
  return raw(s);
}
