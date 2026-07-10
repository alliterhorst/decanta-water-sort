/**
 * Service worker registration with two custom behaviors:
 *
 *  1. QA/dev BYPASS: `?sw=off` in the URL disables the service worker and CLEARS everything
 *     (registration + Cache Storage) — without this, a fresh build can keep being masked by the
 *     previous build's cache, breaking the "always test the newest build" QA rule. The flag
 *     persists in localStorage — no need to repeat `?sw=off` on every reload within the same
 *     test session. `?sw=on` turns it back on (useful for checking the REAL PWA/offline behavior
 *     when that's the intent of the test).
 *
 *  2. UPDATE DETECTION: checks whether a new version has been published instead of waiting for
 *     the browser's default cycle for checking sw.js (which can take up to 24h). Triggers, from
 *     most to least common in an INSTALLED PWA (symptom: "only updates after clearing the cache"):
 *       a) page load (F5, reopening the app/tab);
 *       b) focus returns (tab/app switch, or screen unlock — 'visibilitychange');
 *       c) 'pageshow' with bfcache (Safari/iOS often restores the frozen page from memory
 *          instead of reloading when reopened from the icon — this fires neither load nor,
 *          reliably, visibilitychange; pageshow is the only signal left in that case);
 *       d) a periodic interval while the app stays open in the foreground without ever losing
 *          focus (a long play session) — without it, only (a)/(b)/(c) would ever fire.
 *     When a new version is found, it does NOT reload on its own anymore (real field complaint,
 *     2026-07-09: a silent auto-reload could fire mid-phase, mid-pour). Instead it calls whatever
 *     handler App.tsx registered via `setUpdateReadyHandler` — App decides WHEN it's safe to
 *     show the "update installed" modal (immediately at the menu; deferred until back at the
 *     menu if a phase is in progress) and hands the player an explicit "reiniciar agora" choice.
 *     `pendingApply` covers the (practically negligible, but real) race where the update check
 *     resolves before App.tsx's mount effect has registered its handler.
 */
import { registerSW } from 'virtual:pwa-register';

const SW_DISABLED_KEY = 'decanta:sw-disabled';
const PERIODIC_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30min — long play session without losing focus

type UpdateReadyHandler = (applyNow: () => void) => void;
let updateReadyHandler: UpdateReadyHandler | null = null;
let pendingApply: (() => void) | null = null;

/** App.tsx calls this once on mount. If an update was already detected before the handler
 *  registered, it fires right away instead of being silently dropped. */
export function setUpdateReadyHandler(handler: UpdateReadyHandler): void {
  updateReadyHandler = handler;
  if (pendingApply) {
    const apply = pendingApply;
    pendingApply = null;
    handler(apply);
  }
}

function readSwFlagFromUrl(): 'on' | 'off' | null {
  const v = new URLSearchParams(location.search).get('sw');
  return v === 'off' || v === 'on' ? v : null;
}

async function disableAndClean(): Promise<void> {
  localStorage.setItem(SW_DISABLED_KEY, '1');
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }
}

export async function initPwa(): Promise<void> {
  const urlFlag = readSwFlagFromUrl();
  if (urlFlag === 'off') { await disableAndClean(); return; }
  if (urlFlag === 'on') localStorage.removeItem(SW_DISABLED_KEY);

  if (localStorage.getItem(SW_DISABLED_KEY) === '1') {
    // QA session with the SW disabled — make sure nothing is left over from a previous session
    // (e.g. the flag was set after an old SW had already registered).
    await disableAndClean();
    return;
  }

  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const checkNow = () => void registration.update();

      // Check for an update NOW (don't wait for the browser's default cycle) — covers "F5"/"reopen the app".
      checkNow();
      // And again whenever the tab becomes visible — covers "reopen/switch tab" more reliably
      // than a setInterval alone (background tabs get suspended).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkNow();
      });
      // 'pageshow' covers the case of an installed PWA restored from bfcache (common on Safari/iOS
      // when reopened from the icon) — in that case the browser does NOT reload the page nor fire
      // 'visibilitychange' reliably, only pageshow (with persisted:true).
      window.addEventListener('pageshow', (e) => { if (e.persisted) checkNow(); });
      // Long play session in the foreground, without EVER losing focus (no tab switch, no screen
      // lock): without this the 3 triggers above would never fire and the player would be stuck
      // on an old version until closing and reopening the app.
      setInterval(() => { if (document.visibilityState === 'visible') checkNow(); }, PERIODIC_CHECK_INTERVAL_MS);
    },
    onNeedRefresh() {
      // Hand control to App.tsx instead of reloading on our own (real field complaint,
      // 2026-07-09: a silent reload could fire mid-phase). App decides WHEN to show the modal
      // and only reloads if the player taps "reiniciar agora".
      const applyNow = () => void updateSW(true); // skipWaiting + reload
      if (updateReadyHandler) updateReadyHandler(applyNow);
      else pendingApply = applyNow; // App hasn't registered yet — deliver as soon as it does
    },
  });
}
