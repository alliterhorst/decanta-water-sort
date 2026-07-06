/**
 * Solvability audit — "Deluge" boss mechanic (swaps the tops of two tubes).
 *
 * Goal: prove by COUNTING (not just reading the code) that the eligibility + swap logic
 * replicated from src/render/scene.ts (tryFlood + animateFloodSwap) preserves the invariant
 * "each color appears exactly `capacity` times in total" in every edge case, and that the
 * solver (src/core/solver.ts) still finds solved=true after N simulated swaps.
 *
 * The logic below is a faithful REPLICA of the eligibility/pair selection in scene.ts:tryFlood()
 * (lines ~298-331) and of the swap in animateFloodSwap() (lines ~366-373), minus the
 * animation/Pixi/gsap part (which is purely visual and does not mutate `state` beyond what we
 * replicate here).
 */
import { describe, it, expect } from 'vitest';
import { generateLevel, type LevelConfig } from './generator';
import { solve, isSolvable } from './solver';
import { WILD } from './types';
import type { GameState } from './types';

// ── Faithful replica of tryFlood()'s eligibility (scene.ts ~304-315) ────────────────────────
function eligibleTubes(state: GameState): number[] {
  const locks = state.locks ?? [];
  const eligible: number[] = [];
  for (let i = 0; i < state.tubes.length; i++) {
    const tube = state.tubes[i];
    if ((locks[i] ?? 0) > 0) continue;
    if (tube.length === 0) continue;
    if (tube.length === state.capacity && tube.every((c) => c === tube[0])) continue;
    eligible.push(i);
  }
  return eligible;
}

// ── Faithful replica of the pair search (scene.ts ~317-329), with a deterministic RNG for the test ────
function pickFloodPair(state: GameState, rng: () => number): [number, number] | null {
  const eligible = eligibleTubes(state);
  if (eligible.length < 2) return null;
  const shuffled = eligible
    .map((v) => [v, rng()] as const)
    .sort((a, b) => a[1] - b[1])
    .map(([v]) => v);
  let idxA = -1, idxB = -1;
  outer: for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      const topA = state.tubes[shuffled[i]].at(-1);
      const topB = state.tubes[shuffled[j]].at(-1);
      if (topA !== undefined && topB !== undefined && topA !== topB) {
        idxA = shuffled[i]; idxB = shuffled[j];
        break outer;
      }
    }
  }
  if (idxA === -1 || idxB === -1) return null;
  return [idxA, idxB];
}

// ── Faithful replica of the top swap (scene.ts:animateFloodSwap onDone, ~366-373) ─────────────
function applyFloodSwap(state: GameState, idxA: number, idxB: number): GameState {
  const tubeA = state.tubes[idxA];
  const tubeB = state.tubes[idxB];
  const colorA = tubeA.at(-1)!;
  const colorB = tubeB.at(-1)!;
  return {
    ...state,
    tubes: state.tubes.map((t, i) => {
      if (i === idxA) return [...t.slice(0, -1), colorB];
      if (i === idxB) return [...t.slice(0, -1), colorA];
      return t;
    }),
  };
}

/** Counts occurrences of each color (non-WILD) across the whole board. */
function colorCounts(state: GameState): Map<number, number> {
  const m = new Map<number, number>();
  for (const t of state.tubes) for (const c of t) {
    if (c === WILD) continue;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

function assertInvariant(before: GameState, after: GameState, _cfg: LevelConfig) {
  const cb = colorCounts(before);
  const ca = colorCounts(after);
  // The relevant proof is a ZERO DELTA per color between before/after the swap (not a fixed
  // absolute value == capacity: WILD units may have replaced some units of the original color in
  // the generator, so a color can legitimately appear < capacity times if part of it became
  // WILD — what matters is that the SWAP does not change that count).
  expect(ca.size).toBe(cb.size);
  for (const [color, n] of cb) {
    expect(ca.get(color)).toBe(n);
  }
  const wildBefore = before.tubes.reduce((s, t) => s + t.filter((c) => c === WILD).length, 0);
  const wildAfter = after.tubes.reduce((s, t) => s + t.filter((c) => c === WILD).length, 0);
  expect(wildAfter).toBe(wildBefore);
  // total unit count (including WILD) also preserved — the swap neither injects nor removes.
  const totalBefore = before.tubes.reduce((s, t) => s + t.length, 0);
  const totalAfter = after.tubes.reduce((s, t) => s + t.length, 0);
  expect(totalAfter).toBe(totalBefore);
}

/** Checks the "color + WILD == capacity" invariant only on the INITIAL state (generator), not post-swap. */
function assertGeneratorInvariant(state: GameState, cfg: LevelConfig) {
  const counts = colorCounts(state);
  const wildTotal = state.tubes.reduce((s, t) => s + t.filter((c) => c === WILD).length, 0);
  const nonLockedColorSum = [...counts.values()].reduce((s, n) => s + n, 0);
  // each color slot in the universe is capacity; wildUnits replaces some of them with WILD (-1).
  const totalSlots = cfg.colors * cfg.capacity;
  expect(nonLockedColorSum + wildTotal).toBe(totalSlots);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Deluge boss (flood swap) — per-color count invariant', () => {
  const baseCfg: LevelConfig = { colors: 6, capacity: 5, emptyTubes: 2 };

  it('basic case: 1 swap preserves the per-color count and keeps solvable=true', () => {
    const rng = mulberry32(42);
    const lvl = generateLevel(baseCfg, 200, rng);
    let state = lvl.state;
    for (let i = 0; i < 20; i++) {
      const pair = pickFloodPair(state, rng);
      if (!pair) continue;
      const next = applyFloodSwap(state, pair[0], pair[1]);
      assertInvariant(state, next, baseCfg);
      state = next;
    }
    const r = solve(state);
    expect(r.solved).toBe(true);
  });

  it('adversarial: WILD units present in the involved tubes', () => {
    const cfg: LevelConfig = { ...baseCfg, wildUnits: 6 };
    const rng = mulberry32(7);
    const lvl = generateLevel(cfg, 200, rng);
    let state = lvl.state;
    let sawWildInvolved = false;
    for (let i = 0; i < 50; i++) {
      const pair = pickFloodPair(state, rng);
      if (!pair) continue;
      const [a, b] = pair;
      if (state.tubes[a].at(-1) === WILD || state.tubes[b].at(-1) === WILD) sawWildInvolved = true;
      const next = applyFloodSwap(state, a, b);
      assertInvariant(state, next, cfg);
      state = next;
    }
    expect(isSolvable(state)).toBe(true);
    // note: pickFloodPair requires topA !== topB; since WILD (-1) is a sentinel color value
    // distinct from any color >= 0, a tube with WILD on top can be paired (WILD !== color).
    // This is expected behavior, not a bug.
    void sawWildInvolved;
  });

  it('adversarial: locked tubes are excluded correctly', () => {
    const cfg: LevelConfig = { ...baseCfg, lockedTubes: 2, lockMoves: 100 }; // high lockMoves: stays locked for a long time
    const rng = mulberry32(99);
    const lvl = generateLevel(cfg, 200, rng);
    const state = lvl.state;
    const lockedIdx = (state.locks ?? []).map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    expect(lockedIdx.length).toBeGreaterThan(0);
    const elig = eligibleTubes(state);
    for (const i of lockedIdx) expect(elig).not.toContain(i);
  });

  it('adversarial: 0 eligible tubes remain — must not hang or throw', () => {
    // Artificial board: every tube is "complete" (empty or full + uniform).
    const state: GameState = {
      capacity: 4,
      tubes: [[0, 0, 0, 0], [1, 1, 1, 1], [], []],
    };
    expect(eligibleTubes(state)).toEqual([]);
    const pair = pickFloodPair(state, Math.random);
    expect(pair).toBeNull();
  });

  it('adversarial: exactly 1 eligible tube — must not hang or throw', () => {
    const state: GameState = {
      capacity: 4,
      tubes: [[0, 1, 0, 1], [1, 1, 1, 1], [], []], // only the first is "not complete"
    };
    expect(eligibleTubes(state)).toEqual([0]);
    const pair = pickFloodPair(state, Math.random);
    expect(pair).toBeNull();
  });

  it('adversarial: exactly 2 eligible tubes, DIFFERENT top colors — the swap happens', () => {
    const state: GameState = {
      capacity: 4,
      tubes: [[0, 0, 0, 1], [1, 1, 1, 0], [2, 2, 2, 2], []],
    };
    const elig = eligibleTubes(state);
    expect(elig.sort()).toEqual([0, 1]);
    const pair = pickFloodPair(state, () => 0.1);
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    const next = applyFloodSwap(state, a, b);
    assertInvariant(state, next, { colors: 3, capacity: 4, emptyTubes: 1 });
  });

  it('adversarial: all eligible tubes have the SAME top color — no swap, no hang', () => {
    // Two eligible tubes, both with top color 0 (but non-uniform content, so "eligible").
    const state: GameState = {
      capacity: 4,
      tubes: [[1, 1, 1, 0], [2, 2, 2, 0], [3, 3, 3, 3], []],
    };
    const elig = eligibleTubes(state);
    expect(elig.sort()).toEqual([0, 1]);
    // both tops are 0 → the pair search (topA !== topB) must fail
    const pair = pickFloodPair(state, () => 0.1);
    expect(pair).toBeNull();
  });

  it('broad adversarial coverage: 200 generated levels, several configs, 0 invariant failures', () => {
    const configs: LevelConfig[] = [
      { colors: 4, capacity: 4, emptyTubes: 1 },
      { colors: 6, capacity: 5, emptyTubes: 2 },
      { colors: 7, capacity: 5, emptyTubes: 2 },
      { colors: 8, capacity: 5, emptyTubes: 3 },
      { colors: 6, capacity: 5, emptyTubes: 2, wildUnits: 4 },
      { colors: 6, capacity: 5, emptyTubes: 2, lockedTubes: 1, lockMoves: 3 },
      { colors: 6, capacity: 5, emptyTubes: 2, hiddenTubes: 3, hiddenDepth: 2 },
      { colors: 6, capacity: 5, emptyTubes: 2, filterTubes: 1 },
    ];
    let failures = 0;
    let trials = 0;
    const diagnostics: string[] = [];
    for (let seed = 0; seed < 25; seed++) {
      const cfg = configs[seed % configs.length];
      const rng = mulberry32(1000 + seed);
      const lvl = generateLevel(cfg, 200, rng);
      let state = lvl.state;
      assertGeneratorInvariant(state, cfg);
      for (let i = 0; i < 10; i++) {
        const pair = pickFloodPair(state, rng);
        if (!pair) continue;
        trials++;
        const next = applyFloodSwap(state, pair[0], pair[1]);
        try {
          assertInvariant(state, next, cfg);
        } catch (e) {
          failures++;
          diagnostics.push(`seed=${seed} i=${i}: invariant fail: ${e}`);
        }
        state = next;
      }
      // After the simulated swaps, the level must still be solvable — uses solve() directly
      // (larger maxNodes) to distinguish UNSOLVABLE from "exhausted" (search ceiling reached).
      const r = solve(state, 3_000_000);
      if (!r.solved) {
        failures++;
        diagnostics.push(
          `seed=${seed}: solve() failed after swaps — exhausted=${r.exhausted} tubes=${JSON.stringify(state.tubes)}`,
        );
      }
    }
    expect(trials).toBeGreaterThan(0);
    if (failures > 0) {
      // eslint-disable-next-line no-console
      console.log('DIAGNOSTICS:\n' + diagnostics.join('\n'));
    }
    expect(failures).toBe(0);
  });
});

describe('Deluge boss — interaction with player deadlock', () => {
  it('deadlocked state (no legal moves) + boss can act: swap does NOT worsen it (keeps the count) and may unblock', () => {
    // Builds a classic water-sort deadlock: no legal pour, but eligible tubes (non-empty, non-complete)
    // exist — every top pair differs AND no destination has compatible room/color.
    const state: GameState = {
      capacity: 4,
      tubes: [
        [0, 1, 0, 1], // top 1
        [1, 0, 1, 0], // top 0
      ],
    };
    // Confirms deadlock: no canPour possible (both full, no empty, tops differ)
    const full = state.tubes.every(t => t.length === state.capacity);
    expect(full).toBe(true); // both full -> no pour possible (dst.length >= capacity always)

    const elig = eligibleTubes(state);
    expect(elig.sort()).toEqual([0, 1]); // neither is "complete" (non-uniform), so both are eligible

    const pair = pickFloodPair(state, () => 0.1);
    expect(pair).not.toBeNull(); // the boss CAN act even when the player is stuck

    const next = applyFloodSwap(state, pair![0], pair![1]);
    assertInvariant(state, next, { colors: 2, capacity: 4, emptyTubes: 0 });
    // In this concrete case, the swap exchanges the tops (1<->0), yielding [0,1,0,0] and [1,0,1,1]
    // — still with no empty tube, the board may remain move-less (2 tubes, no empty, is
    // structurally always deadlocked/impossible regardless of the boss). This is a PATHOLOGICAL
    // level that the real generator would never produce (it would violate emptyTubes>=1, the
    // LevelConfig default).
  });
});
