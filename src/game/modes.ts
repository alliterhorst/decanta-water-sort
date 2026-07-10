/**
 * Journey game modes.
 * Each mode adjusts: phase difficulty, available mechanics and power-up limits.
 */

export type JourneyMode = 'zen' | 'balanced' | 'extreme';

export interface ModeConfig {
  id: JourneyMode;
  // name/tagline/description do NOT live here — they're UI text, translated via t.modes[id] in
  // i18n/locales/*.ts (see src/i18n/types.ts). This object only holds game/config data.
  emoji: string;
  accentColor: string;
  // Level generation
  colorOffset: number;       // delta applied to the color count (zen = -1, extreme = +1)
  maxColors: number;
  mechTier: number;          // minimum tier for special mechanics to appear (zen = never = 99)
  emptyTubesBonus: number;   // extra empty tubes in the generator (zen = +1, extreme = -1)
  // Power-ups (−1 = unlimited)
  maxUndos: number;
  maxHints: number;
  maxExtraTubes: number;
}

export const MODES: Record<JourneyMode, ModeConfig> = {
  zen: {
    id: 'zen',
    emoji: '🌿',
    accentColor: '#34d399',
    colorOffset: -1,
    maxColors: 6,
    mechTier: 99,
    emptyTubesBonus: 1,
    maxUndos: -1,
    maxHints: -1,
    maxExtraTubes: -1,
  },
  balanced: {
    id: 'balanced',
    emoji: '⚖️',
    accentColor: '#60a5fa',
    colorOffset: 0,
    maxColors: 8,
    // Pushed from 1 → 3 (mechanics only from phase ~19 onward): gives a first dozen
    // purely "vanilla" phases as onboarding, aligned with the genre's convention.
    mechTier: 3,
    emptyTubesBonus: 0,
    maxUndos: -1,
    maxHints: -1,
    maxExtraTubes: -1,
  },
  extreme: {
    id: 'extreme',
    emoji: '💀',
    accentColor: '#f87171',
    colorOffset: 1,
    maxColors: 9,
    mechTier: 1,
    // Was -1 (single empty tube). Measured solvability of random boards (200 trials/config,
    // 2026-07-09): with 1 empty tube, 7 colors ≈ 5.5% solvable, 8 ≈ 1.5%, 9 = 0% — the
    // generator burned all attempts and fell back to a TRIVIAL pre-solved board on high
    // phases. With 2 empty tubes every extreme config is 100% solvable (avg optimal 28-44
    // moves). Extreme's identity now rests on +1 color, early mechanics and hard power-up
    // limits — not on an empty-tube count that made real puzzles ungeneratable.
    emptyTubesBonus: 0,
    maxUndos: 0,
    maxHints: 3,
    maxExtraTubes: 0,
  },
};

export const DEFAULT_MODE: JourneyMode = 'balanced';
