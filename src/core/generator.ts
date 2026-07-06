/**
 * Generator for SOLVABLE levels.
 * Industry-standard strategy: generate at random + VALIDATE with the solver, and
 * regenerate if unsolvable/too easy. The optimal solution length becomes the
 * difficulty score. (Shuffling backward from the solution is cheaper, but color
 * merging is irreversible and can yield impossible levels — hence we validate.)
 */
import { isWin } from './engine';
import { solveLength } from './solver';
import { WILD } from './types';
import type { GameState } from './types';

export interface LevelConfig {
  colors: number;
  capacity: number;
  emptyTubes: number;
  /** How many tubes start capped (cork). 0/absent = none. */
  lockedTubes?: number;
  /** Moves until the cork dissolves. Default 3. */
  lockMoves?: number;
  /** How many units become WILDCARDS (match any color). 0/absent = none. */
  wildUnits?: number;
  /** How many empty tubes become FILTERS (accept a single color only). 0/absent = none. */
  filterTubes?: number;
  /** How many tubes have a HIDDEN BOTTOM. 0/absent = none. */
  hiddenTubes?: number;
  /** How many bottom units are hidden per tube (keeps the top visible). Default 2. */
  hiddenDepth?: number;
  /** Enables ALCHEMY (pouring A onto B creates a 3rd color). See MIX_RECIPES in the engine. */
  alchemy?: boolean;
}

export interface GeneratedLevel {
  state: GameState;
  /** Number of moves in the optimal solution (difficulty). */
  optimalMoves: number;
}

/** Randomness source: returns [0,1). Default `Math.random`; seedable for the daily challenge. */
export type RNG = () => number;

/** Deterministic PRNG (mulberry32): same seed → same sequence, on any device. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable integer seed from a string (e.g. "2026-06-29") — FNV-1a hash. */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shuffle<T>(a: T[], rng: RNG = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a balanced random state (each color with exactly `capacity` units). */
function randomState(cfg: LevelConfig, rng: RNG): GameState {
  const nLocked = Math.min(cfg.lockedTubes ?? 0, cfg.colors);

  // Locked tubes must be UNIFORM in color — set aside reserved colors before shuffling.
  // Shuffle the color order so the "locked colors" are random.
  const colorOrder = shuffle(Array.from({ length: cfg.colors }, (_, i) => i), rng);
  const lockedColors = colorOrder.slice(0, nLocked);
  const lockedSet = new Set(lockedColors);

  // Pool of only the colors NOT reserved for locked tubes
  const pool: number[] = [];
  for (let c = 0; c < cfg.colors; c++) {
    if (!lockedSet.has(c)) {
      for (let k = 0; k < cfg.capacity; k++) pool.push(c);
    }
  }
  shuffle(pool, rng);

  const tubes: number[][] = [];
  // Locked tubes (indices 0..nLocked-1): uniform color — invariant guaranteed here
  for (const c of lockedColors) {
    tubes.push(new Array(cfg.capacity).fill(c));
  }
  // Free tubes: from the shuffled pool
  const freeTubes = cfg.colors - nLocked;
  for (let t = 0; t < freeTubes; t++) {
    tubes.push(pool.slice(t * cfg.capacity, (t + 1) * cfg.capacity));
  }
  // Empty tubes
  for (let e = 0; e < cfg.emptyTubes; e++) tubes.push([]);

  const state: GameState = { tubes, capacity: cfg.capacity };
  if (cfg.alchemy) state.alchemy = true;
  applyLocks(state, cfg, rng);
  applyWilds(state, cfg, rng);
  applyFilters(state, cfg, rng);
  applyHidden(state, cfg, rng);
  return state;
}

/** Swaps `wildUnits` random units for WILDCARDS (makes the sort more flexible). */
function applyWilds(state: GameState, cfg: LevelConfig, rng: RNG): void {
  const n = cfg.wildUnits ?? 0;
  if (n <= 0) return;
  const locks = state.locks ?? [];
  const slots: Array<[number, number]> = [];
  // Do not apply WILD to a locked tube — keep the uniform color that makes the cork valid
  state.tubes.forEach((t, i) => { if (!(locks[i] ?? 0)) t.forEach((_, p) => slots.push([i, p])); });
  shuffle(slots, rng);
  for (let k = 0; k < Math.min(n, slots.length); k++) {
    const [i, p] = slots[k];
    state.tubes[i][p] = WILD;
  }
}

/** Marks `filterTubes` EMPTY tubes as a single-color filter (exclusive destination for that color). */
function applyFilters(state: GameState, cfg: LevelConfig, rng: RNG): void {
  const n = cfg.filterTubes ?? 0;
  if (n <= 0) return;
  const filters: (number | null)[] = new Array(state.tubes.length).fill(null);
  const colors = shuffle(Array.from({ length: cfg.colors }, (_, c) => c), rng);
  const empties = shuffle(
    state.tubes.map((_, i) => i).filter((i) => state.tubes[i].length === 0),
    rng,
  );
  const m = Math.min(n, colors.length, empties.length);
  for (let k = 0; k < m; k++) filters[empties[k]] = colors[k];
  if (m > 0) state.filters = filters;
}

/** Flips the bottom units of `hiddenTubes` tubes face-down (keeps the top visible). */
function applyHidden(state: GameState, cfg: LevelConfig, rng: RNG): void {
  const n = cfg.hiddenTubes ?? 0;
  if (n <= 0) return;
  const depth = cfg.hiddenDepth ?? 2;
  const hidden = state.tubes.map((t) => t.map(() => false));
  const filled = shuffle(
    state.tubes.map((_, i) => i).filter((i) => state.tubes[i].length > 1),
    rng,
  );
  const m = Math.min(n, filled.length);
  for (let k = 0; k < m; k++) {
    const i = filled[k];
    const len = state.tubes[i].length;
    for (let p = 0; p < Math.min(depth, len - 1); p++) hidden[i][p] = true; // top (len-1) stays visible
  }
  if (m > 0) state.hidden = hidden;
}

/**
 * Caps the first `lockedTubes` tubes with a cork that lasts `lockMoves` moves.
 * Indices 0..lockedTubes-1 are guaranteed to be uniform in color (see randomState).
 */
function applyLocks(state: GameState, cfg: LevelConfig, _rng: RNG): void {
  const n = cfg.lockedTubes ?? 0;
  if (n <= 0) return;
  const moves = cfg.lockMoves ?? 3;
  const locks = new Array(state.tubes.length).fill(0);
  for (let k = 0; k < Math.min(n, cfg.colors); k++) locks[k] = moves;
  state.locks = locks;
}

/**
 * Generates a level that is guaranteed solvable and meets a minimum difficulty.
 * Makes several attempts; falls back to a solvable-by-construction state if needed.
 */
export function generateLevel(
  cfg: LevelConfig,
  attempts = 200,
  rng: RNG = Math.random,
): GeneratedLevel {
  const minMoves = Math.max(cfg.colors, 4); // avoid trivial levels
  let best: GeneratedLevel | null = null;

  for (let i = 0; i < attempts; i++) {
    const state = randomState(cfg, rng);
    if (isWin(state)) continue;
    // Reject levels with a tube already solved at the start — except locked ones (uniform by design)
    const lockArr = state.locks ?? [];
    if (state.tubes.some((t, i) =>
      !(lockArr[i] ?? 0) &&
      t.length === cfg.capacity && t[0] >= 0 && t.every(c => c === t[0])
    )) continue;
    // Validation-only solve: we never use the move PATH here, just solvability + length —
    // solveLength keeps the search's peak memory ~2 orders of magnitude below solve()
    // (numeric visited set, no parent map), which is what blew up the worker on phones.
    const r = solveLength(state);
    if (!r.solved) continue;

    const lvl: GeneratedLevel = { state, optimalMoves: r.length };
    if (r.length >= minMoves) return lvl;
    if (!best || lvl.optimalMoves > best.optimalMoves) best = lvl; // keep the best "easy" one
  }

  if (best) return best;
  // Robust fallback: solved state (always solvable) — extremely rare to reach here.
  return { state: solvedState(cfg), optimalMoves: 0 };
}

function solvedState(cfg: LevelConfig): GameState {
  const tubes: number[][] = [];
  for (let c = 0; c < cfg.colors; c++) {
    tubes.push(new Array(cfg.capacity).fill(c));
  }
  for (let e = 0; e < cfg.emptyTubes; e++) tubes.push([]);
  return { tubes, capacity: cfg.capacity };
}
