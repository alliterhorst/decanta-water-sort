/**
 * A* solver — path with the MINIMUM number of moves, more efficient than BFS.
 *
 * Heuristic (per color c, over unsolved tubes):
 *   h(s) = Σ_c [ segs(c) − home(c) ]
 * where segs(c) is the number of contiguous "segments" of c and home(c) is 1 when some
 * tube's LOWEST real unit is c (that bottom segment can stay put and become c's final
 * tube — every other segment must be poured at least once). This dominates the older
 * Σ max(0, segs−1) form (it only credits a "free" segment when a real home exists),
 * so A* explores significantly fewer states for the same result.
 *
 * Memory: the search frontier is the real cost driver on big boards (8 colors ×
 * capacity 6 explode past 10⁵ states). Two independent levers keep it in check:
 *  - `solveLength()` — validation-only variant used by the level generator. It tracks
 *    visited/g-cost by a 53-bit NUMERIC hash of the canonical state (no string keys,
 *    no parent map — we only need "solvable?" + the solution length). A hash collision
 *    is astronomically rare and, when it happens, can only make a level be judged
 *    unsolvable (→ regenerated) — never ships a broken level.
 *  - both paths prune symmetric branches: with N identical empty tubes, pouring into
 *    each of them yields the same canonical state, so only the first is expanded.
 */
import { applyMove, canonicalKey, cloneState, isWin, isTubeDone, solverMoves } from './engine';
import { WILD } from './types';
import type { GameState, Move } from './types';

export interface SolveResult {
  solved: boolean;
  /** Sequence of moves to victory (empty if already won, null if unsolvable). */
  moves: Move[] | null;
  /** Hit the node ceiling (inconclusive result). */
  exhausted: boolean;
}

export interface SolveLengthResult {
  solved: boolean;
  /** Number of moves in the found solution (0 if already won; -1 if unsolvable). */
  length: number;
  /** Hit the node ceiling (inconclusive result). */
  exhausted: boolean;
}

// ── Heuristic ──────────────────────────────────────────────────────────────────

/**
 * h(s) = Σ_c [ segs(c) − home(c) ] — see the header comment.
 * WILD is transparent: it neither starts nor ends a segment, and a wild-only bottom
 * grants no home (a pure-wild tube could serve any color, so crediting it to every
 * color would undercount).
 * With alchemy the "pours partition by color" argument breaks (a pour can transmute
 * two colors at once), so we fall back to the weaker segs−1 form there.
 */
function heuristic(s: GameState): number {
  const segs = new Map<number, number>();
  const home = new Set<number>();
  for (const tube of s.tubes) {
    if (isTubeDone(tube, s.capacity)) continue;
    let prev = WILD;
    for (const c of tube) {
      if (c === WILD) continue; // wildcard neither interrupts nor starts a segment
      if (c !== prev) {
        segs.set(c, (segs.get(c) ?? 0) + 1);
        prev = c;
      }
    }
    // lowest REAL unit of the tube → potential home for that color
    for (const c of tube) {
      if (c === WILD) continue;
      home.add(c);
      break;
    }
  }
  let h = 0;
  if (s.alchemy) {
    for (const n of segs.values()) if (n > 1) h += n - 1;
  } else {
    for (const [c, n] of segs) h += n - (home.has(c) ? 1 : 0);
  }
  return h;
}

// ── Symmetry pruning ────────────────────────────────────────────────────────────

/**
 * solverMoves() + empty-destination symmetry: pouring into any of N plain empty tubes
 * (no filter, no cork) produces the same canonical state — keep only the first one.
 * Empty FILTERED tubes stay (each filter color is a distinct destination).
 */
function prunedMoves(s: GameState): Move[] {
  const all = solverMoves(s);
  let firstPlainEmpty = -1;
  for (let i = 0; i < s.tubes.length; i++) {
    if (s.tubes[i].length === 0 && s.filters?.[i] == null && !((s.locks?.[i] ?? 0) > 0)) {
      firstPlainEmpty = i;
      break;
    }
  }
  if (firstPlainEmpty === -1) return all;
  return all.filter((m) => {
    if (s.tubes[m.to].length !== 0) return true;
    if (s.filters?.[m.to] != null) return true;
    return m.to === firstPlainEmpty;
  });
}

// ── Min-heap (f = g + h) ────────────────────────────────────────────────────────

class MinHeap {
  private d: Array<[number, GameState]> = [];

  push(f: number, s: GameState): void {
    this.d.push([f, s]);
    let i = this.d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p][0] <= this.d[i][0]) break;
      [this.d[p], this.d[i]] = [this.d[i], this.d[p]];
      i = p;
    }
  }

  pop(): [number, GameState] | undefined {
    if (!this.d.length) return undefined;
    const top = this.d[0];
    const last = this.d.pop()!;
    if (this.d.length) {
      this.d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1, n = this.d.length;
        let m = i;
        if (l < n && this.d[l][0] < this.d[m][0]) m = l;
        if (r < n && this.d[r][0] < this.d[m][0]) m = r;
        if (m === i) break;
        [this.d[m], this.d[i]] = [this.d[i], this.d[m]];
        i = m;
      }
    }
    return top;
  }

  get size(): number { return this.d.length; }
}

// ── 53-bit canonical hash (light validator) ─────────────────────────────────────

function tubeHash(t: number[], mark: number): number {
  let h = 0x811c9dc5;
  h = Math.imul(h ^ (t.length + 1), 0x01000193);
  for (const u of t) h = Math.imul(h ^ (u + 3), 0x01000193);
  h = Math.imul(h ^ mark, 0x01000193);
  return h >>> 0;
}

/** Order-independent (sorted) numeric hash of the canonical state: 32+21 = 53 bits. */
function canonicalHash(s: GameState): number {
  const hs: number[] = new Array(s.tubes.length);
  for (let i = 0; i < s.tubes.length; i++) {
    const mark = (((s.locks?.[i] ?? 0) & 0xff) << 8) ^ (((s.filters?.[i] ?? -2) + 2) & 0xff);
    hs[i] = tubeHash(s.tubes[i], mark);
  }
  hs.sort((a, b) => a - b);
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (const v of hs) {
    h1 = Math.imul(h1 ^ v, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ (v >>> 16), 0x85ebca6b) + (v & 0xffff)) >>> 0;
  }
  return h1 * 2097152 + (h2 >>> 11);
}

// ── Path reconstruction ────────────────────────────────────────────────────────

function reconstruct(
  parent: Map<string, { key: string; move: Move } | null>,
  endKey: string,
): Move[] {
  const path: Move[] = [];
  let cur: string | undefined = endKey;
  while (cur) {
    const p = parent.get(cur);
    if (!p) break;
    path.push(p.move);
    cur = p.key;
  }
  return path.reverse();
}

// ── Main solver (A*) ───────────────────────────────────────────────────────────

/**
 * Solves via A* returning the full move path (hints, tests).
 * `maxNodes` avoids hanging/exploding on pathological instances — default 300,000
 * (with the stronger heuristic + symmetry pruning this is plenty for real boards,
 * and it caps the worst-case memory the search can pin at once).
 */
export function solve(start: GameState, maxNodes = 300_000): SolveResult {
  if (isWin(start)) return { solved: true, moves: [], exhausted: false };

  const startKey = canonicalKey(start);
  const gCost = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, { key: string; move: Move } | null>([[startKey, null]]);
  const closed = new Set<string>();
  const open = new MinHeap();
  open.push(heuristic(start), start);

  let nodes = 0;

  while (open.size > 0) {
    const entry = open.pop()!;
    const cur = entry[1];
    const curKey = canonicalKey(cur);

    if (closed.has(curKey)) continue; // stale entry in the heap
    closed.add(curKey);

    const g = gCost.get(curKey)!;

    for (const mv of prunedMoves(cur)) {
      const nxt = applyMove(cur, mv.from, mv.to);
      const key = canonicalKey(nxt);
      if (closed.has(key)) continue;

      const newG = g + 1;
      if ((gCost.get(key) ?? Infinity) <= newG) continue; // already has a better or equal path

      gCost.set(key, newG);
      parent.set(key, { key: curKey, move: mv });

      if (isWin(nxt)) {
        return { solved: true, moves: reconstruct(parent, key), exhausted: false };
      }

      open.push(newG + heuristic(nxt), nxt);

      if (++nodes > maxNodes) {
        return { solved: false, moves: null, exhausted: true };
      }
    }
  }

  return { solved: false, moves: null, exhausted: false };
}

/**
 * Validation-only A*: same search, but tracks NOTHING it doesn't need — visited/g-cost
 * keyed by the 53-bit numeric hash and no parent map. This is what the level generator
 * calls dozens/hundreds of times per level: peak retained memory drops from hundreds of
 * MB (string keys + parent chains) to a few MB, which is what killed the worker on
 * phones (OOM → dead worker → permanent black screen on phase transitions).
 */
export function solveLength(start: GameState, maxNodes = 150_000): SolveLengthResult {
  if (isWin(start)) return { solved: true, length: 0, exhausted: false };

  const startKey = canonicalHash(start);
  const gCost = new Map<number, number>([[startKey, 0]]);
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(heuristic(start), start);

  let nodes = 0;

  while (open.size > 0) {
    const entry = open.pop()!;
    const cur = entry[1];
    const curKey = canonicalHash(cur);

    if (closed.has(curKey)) continue;
    closed.add(curKey);

    const g = gCost.get(curKey)!;

    for (const mv of prunedMoves(cur)) {
      const nxt = applyMove(cur, mv.from, mv.to);
      const key = canonicalHash(nxt);
      if (closed.has(key)) continue;

      const newG = g + 1;
      if ((gCost.get(key) ?? Infinity) <= newG) continue;

      gCost.set(key, newG);

      if (isWin(nxt)) return { solved: true, length: newG, exhausted: false };

      open.push(newG + heuristic(nxt), nxt);

      if (++nodes > maxNodes) return { solved: false, length: -1, exhausted: true };
    }
  }

  return { solved: false, length: -1, exhausted: false };
}

// ── Utilities (public interface unchanged) ─────────────────────────────────────

/** Is the level solvable from this state? */
export function isSolvable(s: GameState): boolean {
  return solve(s).solved;
}

/** Next best move (the "hint"), or null if there is no solution. */
export function nextHint(s: GameState): Move | null {
  const r = solve(cloneState(s));
  return r.solved && r.moves && r.moves.length > 0 ? r.moves[0] : null;
}
