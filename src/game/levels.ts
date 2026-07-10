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
  // NOTE: no more locked/corked tubes at phase start (direction decision, 2026-07-10). A cork
  // reads as "this bottle is sealed/finished", so it must only ever sit on a COMPLETE tube — the
  // generator placing corks on mixed, unfinished tubes was the absurdity behind two field reports
  // (a "wasted" pre-solved tube; then a cork on an incomplete bottle). The lock infrastructure
  // (LevelConfig.lockedTubes, generator applyLocks, scene cork rendering, isLocked guards) is
  // kept dormant for a possible future "frozen tube" mechanic with a proper non-cork visual.
  let wildUnits: number | undefined;
  let filterTubes: number | undefined;
  let hiddenTubes: number | undefined;

  switch (step) {
    case 0:
      break;
    case 1:
      colors = Math.min(colors + 1, m.maxColors);
      // Was tier>=3 ? 2 : 1. Measured (2026-07-09): a 2nd WILD unit compounds the solver's
      // branching factor without a proportional difficulty gain — p50 321ms→43ms, p99
      // 4179ms→666ms at extreme's 9-color config with wildUnits capped at 1 (n=80, same
      // seeds, solvability unaffected). A single WILD already flexes the match at that slot.
      if (tier >= mechTier) wildUnits = 1;
      break;
    case 2:
      capacity = 5;
      if (tier >= mechTier + 1) hiddenTubes = 2;
      break;
    case 3:
      // Was a locked/corked tube (removed — see note above). Intentionally a vanilla breather
      // phase now; a different mechanic here is a balance decision left to the direction.
      break;
    case 4:
      capacity = 6;
      colors = Math.min(colors + 1, m.maxColors);
      if (tier >= mechTier) { emptyTubes = Math.max(1, 3 + m.emptyTubesBonus); filterTubes = 1; }
      break;
    case 5:
      colors = Math.min(colors + 2, m.maxColors);
      emptyTubes = Math.max(1, 3 + m.emptyTubesBonus);
      // Was locked + wild + filter; the lock was removed (see note above), wild + filter stay.
      if (tier >= mechTier + 1) { wildUnits = 1; filterTubes = 1; }
      break;
  }

  return { colors, capacity, emptyTubes, wildUnits, filterTubes, hiddenTubes };
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
