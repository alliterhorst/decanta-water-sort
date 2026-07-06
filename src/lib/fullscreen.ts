/**
 * Fullscreen via the standard Fullscreen API (no prefixes — desktop Safari, Chrome, Firefox,
 * Edge, and Chrome Android have supported it natively for years).
 *
 * iOS Safari does NOT implement the Fullscreen API on arbitrary elements (only on <video>) —
 * there is no JS workaround. `document.fullscreenEnabled` is already `false` there, so
 * `isFullscreenAvailable()` hides the button on its own. "Real" fullscreen on iPhone is the
 * PWA standalone mode (Add to Home Screen) — see manifest.webmanifest (display:"standalone").
 */

export function isFullscreenAvailable(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenEnabled;
}

export function isFullscreenActive(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}

export async function toggleFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  } catch {
    /* user canceled, or the browser denied it outside a direct gesture — no visible error */
  }
}

/** Heuristic for "is a mobile device" (coarse pointer + narrow screen) — used only to decide
 *  whether it's worth offering the immersive/fullscreen mode in onboarding. Not OS detection,
 *  it's form-factor detection. */
export function isMobileDevice(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 820px)').matches;
}

/** True when the app already runs "installed"/immersive (PWA standalone or fullscreen) — in that
 *  case there's no point offering fullscreen. Covers the legacy iOS fallback (`navigator.standalone`). */
export function isStandalone(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  const mm = matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return mm || iosStandalone;
}

/** iPhone/iPad on Safari, where the Fullscreen API doesn't exist for non-video content — "real"
 *  fullscreen there is Add to Home Screen (A2HS). Detected to swap the message, never to show a
 *  dead fullscreen control. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOSClassic = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ presents itself as "Mac" — detect it via touch on a "Macintosh".
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return iOSClassic || iPadOS;
}
