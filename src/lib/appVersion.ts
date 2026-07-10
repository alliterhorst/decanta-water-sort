/**
 * Tracks which build the player has actually SEEN, separately from which build is currently
 * running — this is what powers the "what's new" one-time note (see ui/UpdateReadyModal.tsx).
 *
 * Two distinct moments can both leave the player on a newer build than what they last
 * acknowledged, and they need different framing:
 *  1. They saw "Nova atualização disponível" and tapped "Instalar agora" — `markInstallPending()`
 *     is called right before the reload, so the FIRST boot on the new build recognizes this and
 *     silently marks itself seen (no redundant popup — they just read the notes seconds ago).
 *  2. The service worker updated itself in the background (e.g. the update became ready while
 *     they were mid-game, got deferred, and they closed the tab before ever returning to the
 *     menu to see the prompt) — next boot is silently already on the new build, with nothing to
 *     acknowledge. THIS is when the "última atualização" note should appear.
 */

// ⚠️ The user-facing "what's new" copy does NOT live here — it lives in the i18n locales
// (src/i18n/locales/*.ts → updateReady.notas, one array per language). Update all three before
// every deploy that should announce something.

const LAST_SEEN_KEY = 'decanta:lastSeenVersion';
const INSTALL_PENDING_KEY = 'decanta:installPending';

function currentVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

/** Call right before triggering the reload from an explicit "Instalar agora" tap. */
export function markInstallPending(): void {
  try { sessionStorage.setItem(INSTALL_PENDING_KEY, '1'); } catch { /* ignore */ }
}

/**
 * Resolves what (if anything) the boot should show for version-catch-up purposes.
 * - 'none': same build as last acknowledged, or this is genuinely the player's first-ever visit
 *   (nothing to catch up on — starts tracking from here silently).
 * - 'silent-ack': this boot is the direct result of an explicit "Instalar agora" tap (the
 *   INSTALL_PENDING flag survived the reload) — mark seen, but don't show the "what's new" note,
 *   they already saw it in the "available" modal seconds ago.
 * - 'whats-new': the build changed WITHOUT an explicit install tap on THIS device — show the
 *   one-time "última atualização" note.
 */
export function resolveVersionCatchUp(): 'none' | 'silent-ack' | 'whats-new' {
  let lastSeen: string | null = null;
  let installPending = false;
  try { lastSeen = localStorage.getItem(LAST_SEEN_KEY); } catch { /* ignore */ }
  try { installPending = sessionStorage.getItem(INSTALL_PENDING_KEY) === '1'; } catch { /* ignore */ }

  if (lastSeen === null) {
    // First-ever visit (or first visit since this tracking existed) — nothing to catch up on.
    markVersionSeen();
    return 'none';
  }
  if (lastSeen === currentVersion()) return 'none';
  if (installPending) {
    try { sessionStorage.removeItem(INSTALL_PENDING_KEY); } catch { /* ignore */ }
    markVersionSeen();
    return 'silent-ack';
  }
  return 'whats-new';
}

/** Marks the CURRENT build as acknowledged — call when the "what's new" note is dismissed
 *  (OK or click-outside), and internally by resolveVersionCatchUp() for the other two cases. */
export function markVersionSeen(): void {
  try { localStorage.setItem(LAST_SEEN_KEY, currentVersion()); } catch { /* ignore */ }
}
