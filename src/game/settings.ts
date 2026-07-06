import type { GameState } from '../core/types';
import { DEFAULT_SFX_STYLE, SFX_OPTIONS, MUSIC_TRACKS } from '../audio/engine';

// ---- Game session (restores the in-progress game after F5 / closing and reopening) ----
const SESSION_KEY = 'decanta:session';

export interface GameSession {
  mode: 'journey' | 'daily';
  phase: number;
  optimalMoves: number;
  moves: number;
  state: GameState;
  history: GameState[];
  initialState: GameState; // initial state used by Restart
  bossId?: string;      // id of the active boss (BossData.id), when phase === -1
  parentPhase?: number; // phase that spawned the boss (bossPhaseRef.current), when phase === -1
  journeyMode?: string; // 'zen' | 'balanced' | 'extreme' — journey mode for this session (only when mode === 'journey' and not a boss); absent in sessions saved before this field existed
}

export function loadSession(): GameSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as GameSession) : null;
  } catch { return null; }
}

export function saveSession(s: GameSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Persisted preferences (music/SFX/UX). localStorage may throw (Safari private mode) → try/catch. */
export interface Prefs {
  music: boolean;
  sfx: boolean;
  sfxStyle: string;    // id from SFX_OPTIONS (audio/engine.ts)
  skipVictory: boolean; // skip the victory modal and go straight to the next phase
  journeyMode: string;  // 'zen' | 'balanced' | 'extreme'
  perfMode?: 'auto' | 'low' | 'high'; // graphics quality
  wildTutorialShown?: boolean; // wildcard tutorial already shown
  musicTrack?: string;  // id from MUSIC_TRACKS or 'dynamic'
  lang?: 'pt-BR' | 'en' | 'es'; // UI language; absent = not yet detected (see i18n/context.tsx)
  fullscreenOnboarded?: boolean; // already showed the fullscreen offer on first mobile visit
}

const KEY = 'frascos:prefs';
// Factory default musicTrack is 'dynamic' — the fixed welcome track (ONBOARDING_TRACK) still
// plays on the menu and the first phase regardless, see App.tsx.
const DEFAULTS: Prefs = { music: true, sfx: true, sfxStyle: DEFAULT_SFX_STYLE, skipVictory: false, journeyMode: 'balanced', perfMode: 'auto', musicTrack: 'dynamic' };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    const prefs: Prefs = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    let migrated = false;
    // Migration by VALIDATION against the manifests (covers ids from the old synthesis —
    // gotejo/cascata/borbulha —, rejected tracks — calm/calm2/calm3 — and any corrupted id):
    // an sfxStyle not in SFX_OPTIONS would leave the game WITHOUT a pour sound forever
    // (fetching a non-existent file fails silently on every pour).
    if (typeof prefs.sfxStyle !== 'string' || !SFX_OPTIONS.some(o => o.id === prefs.sfxStyle)) {
      prefs.sfxStyle = DEFAULT_SFX_STYLE;
      migrated = true;
    }
    if (prefs.musicTrack !== undefined
        && (prefs.musicTrack === 'dynamic' ? false
            : !MUSIC_TRACKS.some(t => t.id === prefs.musicTrack))) {
      prefs.musicTrack = 'dynamic';
      migrated = true;
    }
    if (migrated) savePrefs(prefs);
    return prefs;
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Automatic hints (when the player gets stuck) — separate key so it doesn't clash with audio. */
const HINTS_KEY = 'frascos:hints';

export function loadHints(): boolean {
  try {
    const v = localStorage.getItem(HINTS_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function saveHints(on: boolean): void {
  try {
    localStorage.setItem(HINTS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Color symbols (color-blindness accessibility) — off by default. */
const GLYPHS_KEY = 'frascos:glyphs';

export function loadGlyphs(): boolean {
  try {
    return localStorage.getItem(GLYPHS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveGlyphs(on: boolean): void {
  try {
    localStorage.setItem(GLYPHS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// ---- Journey progress ----
const PROGRESS_KEY = 'decanta:progress';

export function loadProgress(): number {
  try { return Math.max(0, parseInt(localStorage.getItem(PROGRESS_KEY) ?? '0') || 0); } catch { return 0; }
}

export function saveProgress(phase: number): void {
  try { localStorage.setItem(PROGRESS_KEY, String(phase)); } catch { /* ignore */ }
}

// ---- Daily challenge ----
const DAILY_KEY = 'decanta:daily';

export interface DailyRecord {
  date: string;   // YYYY-MM-DD
  stars: number;  // 1-3 (0 = not completed yet)
  moves: number;
}

export function loadDaily(): DailyRecord | null {
  try { const r = localStorage.getItem(DAILY_KEY); return r ? (JSON.parse(r) as DailyRecord) : null; } catch { return null; }
}

export function saveDaily(r: DailyRecord): void {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

// ---- Reset everything (Settings → Danger zone) ----

/** Erases ALL saved progress/config (journey, coins, shop items, preferences, daily record,
 *  in-progress session) + the PWA asset cache, then reloads the page from scratch — the player
 *  sees exactly the same experience as someone who never opened the game. Irreversible; must only
 *  be called after explicit player confirmation (see AjustesModal — 2 steps, not a single tap). */
export async function resetAllData(): Promise<void> {
  try { localStorage.clear(); } catch { /* ignore */ }
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    } catch { /* ignore */ }
  }
  window.location.reload();
}
