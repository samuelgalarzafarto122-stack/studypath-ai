// "Install the app": Android/computer Chrome & Edge show a real install prompt; iPhone/iPad need
// Share → Add to Home Screen (which is also what makes notifications work there).

import { html } from './util.js';
import { IS_ARTIFACT, IS_IOS, IS_ANDROID, isStandalone } from './env.js';
import { icon } from './ui/icons.js';

let deferred = null;
let listeners = new Set();

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

export function installState() {
  if (IS_ARTIFACT) return 'artifact';
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (IS_IOS) return 'ios';
  return 'manual';
}

export async function promptInstall() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  let outcome = 'dismissed';
  try {
    outcome = (await deferred.userChoice).outcome;
  } catch {}
  deferred = null;
  changed();
  return outcome;
}

function dismissed() {
  try {
    return localStorage.getItem('sp:install-dismissed') === '1';
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem('sp:install-dismissed', '1');
  } catch {}
  changed();
}

/** Step-by-step instructions for this device. */
export function installSteps() {
  const st = installState();
  if (st === 'installed') return html`<p class="muted">StudyPath is installed on this device. 🎉</p>`;
  if (st === 'artifact')
    return html`<p class="muted">This is the online demo. To install StudyPath on a phone or computer, open the app's own web address (see the guide), then follow the steps there.</p>`;
  if (st === 'ios')
    return html`<ol class="tips">
      <li>Open this page in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button ${icon('share', { size: 16 })} (square with an arrow).</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      <li>Open StudyPath from your Home Screen and turn on notifications in Profile. (iPhone needs iOS 16.4 or newer.)</li>
    </ol>`;
  if (IS_ANDROID)
    return html`<ol class="tips">
      <li>Open this page in <b>Chrome</b>.</li>
      <li>Tap the menu <b>⋮</b> at the top right.</li>
      <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li>
    </ol>`;
  return html`<ol class="tips">
    <li>In <b>Chrome</b> or <b>Edge</b>, click the install icon ${icon('install', { size: 16, cls: 'inline' })} at the right side of the address bar.</li>
    <li>Or open the browser menu and choose <b>Install StudyPath AI</b> (Chrome: Cast, save and share → Install page as app).</li>
    <li>Safari on Mac: File → <b>Add to Dock</b>.</li>
  </ol>`;
}

/** A card that invites the student to install, or nothing when installed/dismissed. */
export function installCard() {
  const st = installState();
  if (st === 'installed' || st === 'artifact' || dismissed()) return '';
  return html`<section class="card soft">
    <div class="row top">
      <div class="brand-mark" aria-hidden="true">${icon('install')}</div>
      <div class="grow stack tight">
        <h3>Install StudyPath on this device</h3>
        <p class="small muted">It opens like a normal app, works offline, and can send you reminders${st === 'ios' ? ' (on iPhone, only after you add it to the Home Screen)' : ''}.</p>
        <div class="btn-row mt">
          ${st === 'prompt' ? html`<button class="btn small" type="button" data-action="install">${icon('download')}Install app</button>` : html`<button class="btn small" type="button" data-action="install-help">How to install</button>`}
          <button class="btn small ghost" type="button" data-action="install-dismiss">Not now</button>
        </div>
      </div>
    </div>
  </section>`;
}
