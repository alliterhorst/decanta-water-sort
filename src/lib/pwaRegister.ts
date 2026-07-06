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
 *  2. AUTO-UPDATE: checks whether a new version has been published instead of waiting for the
 *     browser's default cycle for checking sw.js (which can take up to 24h). Triggers, from most
 *     to least common in an INSTALLED PWA (symptom: "only updates after clearing the cache"):
 *       a) page load (F5, reopening the app/tab);
 *       b) focus returns (tab/app switch, or screen unlock — 'visibilitychange');
 *       c) 'pageshow' with bfcache (Safari/iOS often restores the frozen page from memory
 *          instead of reloading when reopened from the icon — this fires neither load nor,
 *          reliably, visibilitychange; pageshow is the only signal left in that case);
 *       d) a periodic interval while the app stays open in the foreground without ever losing
 *          focus (a long play session) — without it, only (a)/(b)/(c) would ever fire.
 *     If there's a new version, it applies it with ONE automatic reload (guarded against loops).
 */
import { registerSW } from 'virtual:pwa-register';

const SW_DISABLED_KEY = 'decanta:sw-disabled';
const RELOAD_GUARD_KEY = 'decanta:sw-reload-ts';
const RELOAD_GUARD_WINDOW_MS = 10_000;
const PERIODIC_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30min — long play session without losing focus

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
      // Loop guard: if we already reloaded for this recently, don't reload again.
      const last = sessionStorage.getItem(RELOAD_GUARD_KEY);
      if (last && Date.now() - Number(last) < RELOAD_GUARD_WINDOW_MS) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      void updateSW(true); // apply the new version (skipWaiting) and reload the page
    },
  });
}
