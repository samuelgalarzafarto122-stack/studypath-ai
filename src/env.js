// Where the app is running. The build script sets STUDYPATH_MODE = 'artifact' for the claude.ai
// version (no service worker, cloud = claude.ai database, AI tutor = Claude).

export const MODE = globalThis.STUDYPATH_MODE === 'artifact' ? 'artifact' : 'pwa';
export const IS_ARTIFACT = MODE === 'artifact';

const ua = globalThis.navigator?.userAgent || '';
export const IS_IOS = /iPhone|iPad|iPod/.test(ua) || (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator?.maxTouchPoints > 1);
export const IS_ANDROID = /Android/.test(ua);

export function isStandalone() {
  try {
    return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone);
  } catch {
    return false;
  }
}
