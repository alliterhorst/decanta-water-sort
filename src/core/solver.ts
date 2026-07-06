/**
 * A* solver — path with the MINIMUM number of moves, more efficient than BFS.
 *
 * Heuristic: Σ_c max(0, runs(c) - 1) — number of "segments" per color minus 1.
 * Each move reduces the total segment count by at most 1 → consistent heuristic
 * → A* is optimal and efficient even on hard levels (many colors, capacity 6+).
 *
 * Advantage over plain BFS: A* typically explores 10–100× fewer states for the same
 * solution depth, allowing a larger maxNodes without losing speed.
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

// ── Heuristic ──────────────────────────────────────────────────────────────────

/**
 * Counts the "segments" of each color across all unsolved tubes.
 * h(s) = Σ_c max(0, runs(c) - 1)
 *
 * Admissible and consistent: a pour reduces color segments by ≤ 1 and costs 1.
 * WILD (-1) is ignored in the count (it neither starts nor ends a segment).
 */
function heuristic(s: GameState): number {
  const runs = new Map<number, number>();
  for (const tube of s.tubes) {
    if (isTubeDone(tube, s.capacity)) continue;
    // WILD as the initial sentinel: skip units with c === WILD without resetting the run
    let prev = WILD;
    for (const c of tube) {
      if (c === WILD) continue; // wildcard neither interrupts nor starts a segment
      if (c !== prev) {
        runs.set(c, (runs.get(c) ?? 0) + 1);
        prev = c;
      }
    }
  }
  let h = 0;
  for (const r of runs.values()) if (r > 1) h += r - 1;
  return h;
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
 * Solves via A* with the per-color segment heuristic.
 * `maxNodes` avoids hanging on pathological instances — default 1,000,000.
 */
export function solve(start: GameState, maxNodes = 1_000_000): SolveResult {
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

    for (const mv of solverMoves(cur)) {
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
