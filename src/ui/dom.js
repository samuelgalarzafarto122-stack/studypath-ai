// DOM helpers: dialogs (sheets), confirmations, toasts. No alert/confirm/prompt anywhere:
// every question is asked in the page, so it also works inside embedded viewers.

import { html, raw, uid } from '../util.js';
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openCount = 0;

/**
 * Open a dialog. On phones it slides up from the bottom; on wide screens it is centered.
 * opts: { title, body, foot, onSubmit(data, form, close), actions: { name(el, close) }, onOpen(root), onClose(), label }
 */
export function openSheet(opts) {
  const id = `sheet-${uid()}`;
  const opener = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = String(html`
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <h2 id="${id}-t">${opts.title || ''}</h2>
        <button class="icon-btn" type="button" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="sheet-body">${opts.body || ''}</div>
      ${opts.foot ? html`<div class="sheet-foot">${opts.foot}</div>` : ''}
    </div>
  `);
  const sheet = scrim.firstElementChild;
  let closed = false;

  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.body.style.overflow = '';
    try {
      opener?.focus?.({ preventScroll: true });
    } catch {}
    opts.onClose?.(result);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = [...sheet.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) return close();
    const closer = e.target.closest('[data-close]');
    if (closer && sheet.contains(closer)) return close();
    const act = e.target.closest('[data-sheet-action]');
    if (act && opts.actions?.[act.dataset.sheetAction]) {
      e.preventDefault();
      opts.actions[act.dataset.sheetAction](act, close, e);
    }
  });
  scrim.addEventListener('submit', (e) => {
    const form = e.target.closest('form');
    if (!form || !opts.onSubmit) return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    for (const el of form.querySelectorAll('input[type="checkbox"][name]')) {
      const all = form.querySelectorAll(`input[type="checkbox"][name="${el.name}"]`);
      if (all.length > 1) data[el.name] = [...all].filter((x) => x.checked).map((x) => x.value);
      else data[el.name] = el.checked;
    }
    opts.onSubmit(data, form, close, e.submitter);
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(scrim);
  openCount++;
  document.body.style.overflow = 'hidden';
  opts.onOpen?.(sheet, close);
  requestAnimationFrame(() => {
    const target = sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet-body ' + FOCUSABLE) || sheet.querySelector(FOCUSABLE);
    try {
      target?.focus({ preventScroll: true });
    } catch {}
  });
  return { close, root: sheet };
}

/** Ask a yes/no question in the page. Resolves true or false. */
export function confirmSheet({ title, body = '', confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      body: html`<p class="muted">${body}</p>`,
      foot: html`<button class="btn secondary" type="button" data-close>${cancel}</button>
        <button class="btn ${danger ? 'danger' : ''}" type="button" data-sheet-action="yes" autofocus>${confirm}</button>`,
      actions: {
        yes: (el, close) => {
          answered = true;
          close(true);
        },
      },
      onClose: () => resolve(answered),
    });
  });
}

let toastRoot = null;

/** Small message at the bottom (phones) or bottom-right (computers). */
export function toast(message, { title = '', iconName = 'check', timeout = 4500, href = '', linkLabel = '' } = {}) {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('role', 'status');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = String(html`<span class="ic">${icon(iconName)}</span>
    <div class="grow">${title ? html`<b>${title}</b>` : ''}<span>${message}</span>${href ? html` <a href="${href}">${linkLabel || 'Open'}</a>` : ''}</div>
    <button class="x" type="button" aria-label="Dismiss">×</button>`);
  const remove = () => el.remove();
  el.querySelector('.x').addEventListener('click', remove);
  el.querySelector('a')?.addEventListener('click', remove);
  toastRoot.appendChild(el);
  while (toastRoot.children.length > 3) toastRoot.firstElementChild.remove();
  if (timeout) setTimeout(remove, timeout);
  return remove;
}

/** Keep typed text, focus and caret when a screen re-renders. */
export function snapshotForm(root) {
  const active = document.activeElement;
  const values = {};
  for (const el of root.querySelectorAll('input[id], textarea[id], select[id]')) {
    if (el.type === 'checkbox' || el.type === 'radio') values[el.id] = { checked: el.checked };
    else values[el.id] = { value: el.value };
  }
  const snap = { values, scrolls: {} };
  for (const el of root.querySelectorAll('[data-keep-scroll][id]')) snap.scrolls[el.id] = el.scrollTop;
  if (active && root.contains(active) && active.id) {
    snap.focus = active.id;
    try {
      snap.sel = [active.selectionStart, active.selectionEnd];
    } catch {}
  }
  return snap;
}

export function restoreForm(root, snap) {
  if (!snap) return;
  for (const [id, v] of Object.entries(snap.values)) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (!el || el.dataset.fresh != null) continue;
    if ('checked' in v) el.checked = v.checked;
    else if (el.value !== v.value) el.value = v.value;
  }
  for (const [id, top] of Object.entries(snap.scrolls)) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollTop = top;
  }
  if (snap.focus) {
    const el = root.querySelector(`#${CSS.escape(snap.focus)}`);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (snap.sel && snap.sel[0] != null) el.setSelectionRange(snap.sel[0], snap.sel[1]);
      } catch {}
    }
  }
}

/** Read a form into a plain object (checkbox groups become arrays). */
export function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const names = new Set([...form.querySelectorAll('input[type="checkbox"][name]')].map((x) => x.name));
  for (const name of names) {
    const all = [...form.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
    data[name] = all.length > 1 ? all.filter((x) => x.checked).map((x) => x.value) : all[0].checked;
  }
  return data;
}

export { raw };
