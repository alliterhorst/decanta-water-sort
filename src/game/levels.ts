import type { LevelConfig } from '../core/generator';
import { MODES, type JourneyMode } from './modes';

/**
 * Progression in cycles of 6 phases (step 0-5), scaling per tier (floor(phase/6)).
 * Tier 0: classic only. Tier 1+: special mechanics unlocked progressively.
 * The game mode adjusts difficulty and available mechanics.
 */
export function levelConfig(phase: number, mode: JourneyMode = 'balanced'): LevelConfig {
  const m = MODES[mode];
  const tier = Math.floor(phase / 6);
  const step = phase % 6;
  const mechTier = m.mechTier; // minimum tier for special mechanics

  let colors = Math.min(4 + tier + m.colorOffset, m.maxColors);
  colors = Math.max(3, colors); // never fewer than 3
  let capacity = 4;
  let emptyTubes = Math.max(1, 2 + m.emptyTubesBonus);
  let lockedTubes: number | undefined;
  let lockMoves: number | undefined;
  let wildUnits: number | undefined;
  let filterTubes: number | undefined;
  let hiddenTubes: number | undefined;

  switch (step) {
    case 0:
      break;
    case 1:
      colors = Math.min(colors + 1, m.maxColors);
      if (tier >= mechTier) wildUnits = tier >= 3 ? 2 : 1;
      break;
    case 2:
      capacity = 5;
      if (tier >= mechTier + 1) hiddenTubes = 2;
      break;
    case 3:
      if (tier >= mechTier) { lockedTubes = 1; lockMoves = 3; }
      break;
    case 4:
      capacity = 6;
      colors = Math.min(colors + 1, m.maxColors);
      if (tier >= mechTier) { emptyTubes = Math.max(1, 3 + m.emptyTubesBonus); filterTubes = 1; }
      break;
    case 5:
      colors = Math.min(colors + 2, m.maxColors);
      emptyTubes = Math.max(1, 3 + m.emptyTubesBonus);
      if (tier >= mechTier + 1) { lockedTubes = 1; wildUnits = 1; filterTubes = 1; }
      break;
  }

  return { colors, capacity, emptyTubes, lockedTubes, lockMoves, wildUnits, filterTubes, hiddenTubes };
}

/** Returns the difficulty KEY (not the text — text comes from t.levels[key], see
 *  src/i18n/types.ts). Renamed from diffLabel: it used to return the translated string directly
 *  before i18n; keeping the old name would have been misleading about what it returns now. */
export function diffKey(phase: number): 'facil' | 'medio' | 'dificil' {
  const step = phase % 6;
  if (step <= 1) return 'facil';
  if (step <= 3) return 'medio';
  return 'dificil';
}

export function starsFor(moves: number, optimalMoves: number): number {
  if (optimalMoves <= 0) return 3;
  if (moves <= optimalMoves) return 3;
  if (moves <= Math.ceil(optimalMoves * 1.6)) return 2;
  return 1;
}
