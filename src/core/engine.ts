/**
 * Pure water-sort engine. No Phaser dependency — testable with Vitest.
 *
 * Rules:
 * - Only the TOP color moves.
 * - A pour is valid if the destination is EMPTY or has the SAME color on top, and has room.
 * - The whole top "run" (equal colors stacked) moves, up to whatever fits.
 * - Win: every tube is empty OR full with a single color.
 */
import { WILD } from './types';
import type { GameState, Move, Tube } from './types';

/** Deep copy of the state (for undo history and search). */
export function cloneState(s: GameState): GameState {
  const next: GameState = { capacity: s.capacity, tubes: s.tubes.map((t) => t.slice()) };
  if (s.locks) next.locks = s.locks.slice();
  if (s.filters) next.filters = s.filters.slice();
  if (s.hidden) next.hidden = s.hidden.map((h) => h.slice());
  if (s.alchemy) next.alchemy = true; // global rule must survive clones (undo, solver)
  return next;
}

/** Are two colors compatible to stack? The wildcard (WILD) matches any color. */
export function colorMatches(a: number, b: number): boolean {
  return a === b || a === WILD || b === WILD;
}

/**
 * Alchemy recipes — SUBTRACTIVE pigment mixing (indices = LIQUID_COLORS).
 * red+yellow=orange · blue+yellow=green · red+blue=purple. Symmetric.
 * Only apply when the state has `alchemy` enabled. The wildcard never mixes.
 */
const MIX_RECIPES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 3, 4], // red + yellow = orange
  [1, 3, 2], // blue + yellow = green
  [0, 1, 5], // red + blue = purple
];

/** Resulting color of mixing a+b, or null if there is no recipe (or a wildcard/equal color). */
export function mixResult(a: number, b: number): number | null {
  if (a === WILD || b === WILD || a === b) return null;
  for (const [x, y, c] of MIX_RECIPES) {
    if ((a === x && b === y) || (a === y && b === x)) return c;
  }
  return null;
}

/** Would pouring `from` onto `to` result in a mix (alchemy)? If so, the color. */
export function mixOf(s: GameState, from: number, to: number): number | null {
  if (!s.alchemy) return null;
  const src = s.tubes[from];
  const dst = s.tubes[to];
  if (src.length === 0 || dst.length === 0) return null;
  if (s.filters?.[to] != null) return null; // a filtered tube does not mix
  return mixResult(src[src.length - 1], dst[dst.length - 1]);
}

/** Is the tube monochrome IGNORING wildcards (which take on the other units' color)? */
export function isMono(tube: Tube): boolean {
  let c: number | null = null;
  for (const u of tube) {
    if (u === WILD) continue;
    if (c === null) c = u;
    else if (u !== c) return false;
  }
  return true;
}

/** Is tube `i` capped (cork not yet dissolved)? */
export function isLocked(s: GameState, i: number): boolean {
  return (s.locks?.[i] ?? 0) > 0;
}

/** Top color, or null if empty. */
export function topColor(tube: Tube): number | null {
  return tube.length === 0 ? null : tube[tube.length - 1];
}

/** How many equal units are on top (size of the "run"). */
export function topRun(tube: Tube): number {
  if (tube.length === 0) return 0;
  const c = tube[tube.length - 1];
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}

/** Tube of a single color (empty counts). */
export function isSingleColor(tube: Tube): boolean {
  return tube.every((c) => c === tube[0]);
}

/** "Solved" tube: empty, or full with a single color (wildcards count as that color). */
export function isTubeDone(tube: Tube, capacity: number): boolean {
  if (tube.length === 0) return true;
  return tube.length === capacity && isMono(tube);
}

/** Is the from→to pour legal? */
export function canPour(s: GameState, from: number, to: number): boolean {
  if (from === to) return false;
  if (isLocked(s, from) || isLocked(s, to)) return false; // cork blocks both in and out
  const src = s.tubes[from];
  const dst = s.tubes[to];
  if (src.length === 0) return false;
  if (dst.length >= s.capacity) return false;
  const moving = src[src.length - 1];
  // filter: the destination tube only accepts its color (the wildcard passes, taking that color).
  const f = s.filters?.[to];
  if (f != null && moving !== f && moving !== WILD) return false;
  if (dst.length === 0) return true;
  if (colorMatches(moving, dst[dst.length - 1])) return true;
  // alchemy: different colors may combine if a recipe exists (in a free tube, no filter).
  if (s.alchemy && f == null && mixResult(moving, dst[dst.length - 1]) !== null) return true;
  return false;
}

/** How many units would actually move in from→to (0 if illegal). */
export function pourAmount(s: GameState, from: number, to: number): number {
  if (!canPour(s, from, to)) return 0;
  return Math.min(topRun(s.tubes[from]), s.capacity - s.tubes[to].length);
}

/** Applies the pour and returns a NEW state (does not mutate the original). */
export function applyMove(s: GameState, from: number, to: number): GameState {
  const k = pourAmount(s, from, to);
  if (k <= 0) return s;
  const next = cloneState(s);
  const src = next.tubes[from];
  const dst = next.tubes[to];
  const c = src[src.length - 1];
  // alchemy: detect the mix BEFORE moving (needs the destination top and B's run).
  const dstTop = dst.length > 0 ? dst[dst.length - 1] : null;
  const mix = s.alchemy && dstTop !== null && !colorMatches(c, dstTop) ? mixResult(c, dstTop) : null;
  const lb = mix !== null ? topRun(dst) : 0;
  for (let i = 0; i < k; i++) {
    src.pop();
    dst.push(c);
  }
  if (mix !== null) {
    // transmute the k poured units + the min(k, B's run) right below (the "contact").
    const relabel = k + Math.min(k, lb);
    for (let p = dst.length - 1, n = 0; p >= 0 && n < relabel; p--, n++) dst[p] = mix;
  }
  // each successful move dissolves a bit of ALL corks (countdown).
  if (next.locks) next.locks = next.locks.map((v) => (v > 0 ? v - 1 : 0));
  // hidden bottom: keep the parallel array in sync with the pops/pushes and reveal the
  // source's new top (just exposed). Units landing in the destination arrive visible.
  if (next.hidden) {
    const sh = next.hidden[from];
    if (sh) {
      sh.length = src.length; // dropped k units from the top
      if (src.length > 0) sh[src.length - 1] = false;
    }
    const dh = next.hidden[to];
    if (dh) for (let i = 0; i < k; i++) dh.push(false);
  }
  return next;
}

/** All legal moves from the state (no pruning — used in the game). */
export function legalMoves(s: GameState): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < s.tubes.length; from++) {
    if (s.tubes[from].length === 0) continue;
    for (let to = 0; to < s.tubes.length; to++) {
      const k = pourAmount(s, from, to);
      if (k > 0) moves.push({ from, to, count: k });
    }
  }
  return moves;
}

/**
 * Moves with PRUNING for the solver (discards useless plays that only create cycles):
 * - an already-solved tube does not move;
 * - moving a single-color tube into an empty one is a pointless swap.
 */
export function solverMoves(s: GameState): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < s.tubes.length; from++) {
    const src = s.tubes[from];
    if (src.length === 0) continue;
    if (isTubeDone(src, s.capacity)) continue;
    const srcUniform = isSingleColor(src);
    for (let to = 0; to < s.tubes.length; to++) {
      if (to === from) continue;
      const dst = s.tubes[to];
      if (dst.length === 0 && srcUniform) continue; // useless
      const k = pourAmount(s, from, to);
      if (k > 0) moves.push({ from, to, count: k });
    }
  }
  return moves;
}

/** Won? Every tube empty or full with a single color. */
export function isWin(s: GameState): boolean {
  return s.tubes.every((t) => isTubeDone(t, s.capacity));
}

/** No legal move at all (hard deadlock). */
export function hasNoMoves(s: GameState): boolean {
  return legalMoves(s).length === 0;
}

/**
 * Canonical key: sorts the tubes (symmetric states collapse) — for the visited set.
 * With corks, the tube's identity includes the cork (tubes cannot be freely reordered):
 * each tube becomes "content#cork" and the sort considers the pair, preserving symmetry.
 */
export function canonicalKey(s: GameState): string {
  // No position-bound constraints → free to reorder (full symmetry).
  if (!s.locks && !s.filters) {
    return s.tubes
      .map((t) => t.join(','))
      .sort()
      .join('|');
  }
  // With cork/filter, the tube's identity includes those marks (no free reordering).
  // (The hidden bottom does NOT enter: it does not change reachability and would only bloat visited.)
  return s.tubes
    .map((t, i) => t.join(',') + '#' + (s.locks?.[i] ?? 0) + '@' + (s.filters?.[i] ?? ''))
    .sort()
    .join('|');
}
