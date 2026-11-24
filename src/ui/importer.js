// "Bring data from a file": moves a student's data to a new device using the file from
// "Download my data". Works in every version (no account or server needed).
// Markup: a button with data-action="pick-import" and, anywhere on the same screen, importInput().

import { store } from '../state.js';
import { html } from '../util.js';
import * as A from '../actions.js';
import { toast, confirmSheet } from './dom.js';

const MAX_BYTES = 20 * 1024 * 1024;

/** The hidden file input that pick-import opens. */
export const importInput = () =>
  html`<input type="file" id="import-file" class="sr-only" accept=".json,application/json" data-change="import-file" tabindex="-1" aria-hidden="true">`;

/** Opens the file picker (must run inside the click). */
export function pickImport() {
  document.getElementById('import-file')?.click();
}

/** Reads the chosen file and replaces this device's data with it. */
export async function importFromInput(input, ctx, { replacing = false } = {}) {
  const file = input.files && input.files[0];
  input.value = ''; // picking the same file again still fires "change"
  if (!file) return false;
  const notOurs = () =>
    toast('This file is not a StudyPath export. Use the .json file from “Download my data”.', { iconName: 'alert', timeout: 8000 });
  if (file.size > MAX_BYTES) return notOurs(), false;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return notOurs(), false;
  }
  if (!parsed?.data?.profile || !Array.isArray(parsed.data.classes)) return notOurs(), false;
  if (replacing) {
    const ok = await confirmSheet({
      title: 'Replace the data on this device?',
      body: 'Everything StudyPath has on this device will be replaced with the file. Download your current data first if you want to keep it.',
      confirm: 'Replace my data',
      danger: true,
    });
    if (!ok) return false;
  }
  try {
    A.importData(parsed);
  } catch (e) {
    toast(e.message || 'Could not open that file.', { iconName: 'alert' });
    return false;
  }
  ctx.go('#today');
  const name = store.state.profile.nickname;
  toast(`${name ? `Welcome back, ${name}! ` : ''}Your data is on this device now.`, { title: 'Data moved', iconName: 'check', timeout: 7000 });
  return true;
}
