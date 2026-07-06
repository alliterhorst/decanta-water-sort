import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canPour,
  canonicalKey,
  cloneState,
  colorMatches,
  hasNoMoves,
  isMono,
  isTubeDone,
  isWin,
  legalMoves,
  mixResult,
  pourAmount,
  topRun,
} from './engine';
import { solve, isSolvable } from './solver';
import { generateLevel, mulberry32, seedFromString } from './generator';
import { WILD } from './types';
import type { GameState } from './types';

const st = (tubes: number[][], capacity = 4): GameState => ({ tubes, capacity });

describe('pour rules', () => {
  it('only pours onto empty or same color with room', () => {
    const s = st([[0, 0], [1], [], [0]]);
    expect(canPour(s, 0, 2)).toBe(true); // onto empty
    expect(canPour(s, 0, 3)).toBe(true); // same color (0 onto 0)
    expect(canPour(s, 0, 1)).toBe(false); // 0 onto 1
    expect(canPour(s, 1, 1)).toBe(false); // onto itself
  });

  it('moves the whole top run as far as it fits', () => {
    const s = st([[2, 0, 0], [0]]);
    expect(topRun(s.tubes[0])).toBe(2);
    expect(pourAmount(s, 0, 1)).toBe(2); // 2 fit (destination had 1, cap 4)
    const after = applyMove(s, 0, 1);
    expect(after.tubes[0]).toEqual([2]);
    expect(after.tubes[1]).toEqual([0, 0, 0]);
  });

  it('respects the destination capacity', () => {
    const s = st([[0, 0, 0], [0, 0]]);
    expect(pourAmount(s, 0, 1)).toBe(2); // only 2 fit
  });

  it('does not mutate the original state', () => {
    const s = st([[0], [1]]);
    const snap = JSON.stringify(s);
    applyMove(s, 1, 0);
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('win and deadlock', () => {
  it('detects a win (empty or full monochromatic tubes)', () => {
    expect(isWin(st([[0, 0, 0, 0], [1, 1, 1, 1], []]))).toBe(true);
    expect(isWin(st([[0, 0, 0, 1], [1, 1, 1, 0], []]))).toBe(false);
  });

  it('detects the absence of moves', () => {
    // all full and no pour possible
    const s = st([[0, 1, 0, 1], [1, 0, 1, 0]]);
    expect(hasNoMoves(s)).toBe(true);
    expect(legalMoves(s).length).toBe(0);
  });
});

describe('capped tube (cork)', () => {
  it('a capped tube neither pours nor receives', () => {
    const s: GameState = { tubes: [[0, 0], [0], []], capacity: 4, locks: [2, 0, 0] };
    expect(canPour(s, 0, 1)).toBe(false); // source capped
    expect(canPour(s, 0, 2)).toBe(false); // source capped (onto empty)
    expect(canPour(s, 1, 0)).toBe(false); // destination capped
    expect(canPour(s, 1, 2)).toBe(true); // both open
  });

  it('each move dissolves a bit of every cork', () => {
    const s: GameState = { tubes: [[0, 0], [1], []], capacity: 4, locks: [3, 0, 0] };
    const a1 = applyMove(s, 1, 2); // valid move (1 → empty)
    expect(a1.locks).toEqual([2, 0, 0]);
    const a2 = applyMove(a1, 2, 1); // any other move
    expect(a2.locks).toEqual([1, 0, 0]);
  });

  it('generates a solvable level even with capped tubes', () => {
    for (let i = 0; i < 5; i++) {
      const lvl = generateLevel({ colors: 5, capacity: 4, emptyTubes: 2, lockedTubes: 1, lockMoves: 3 });
      expect(lvl.state.locks).toBeDefined();
      expect(isSolvable(lvl.state)).toBe(true);
    }
  });
});

describe('chameleon wildcard (WILD)', () => {
  it('the wildcard matches any color', () => {
    expect(colorMatches(WILD, 3)).toBe(true);
    expect(colorMatches(2, WILD)).toBe(true);
    expect(colorMatches(2, 2)).toBe(true);
    expect(colorMatches(2, 3)).toBe(false);
  });

  it('pours a wildcard onto a different color and a color onto a wildcard', () => {
    const s = st([[1], [2], [WILD]]);
    expect(canPour(s, 2, 1)).toBe(true); // wildcard onto 2
    expect(canPour(s, 0, 2)).toBe(true); // 1 onto wildcard
    expect(canPour(s, 0, 1)).toBe(false); // 1 onto 2 (no alchemy)
  });

  it('a full tube with a wildcard counts as solved', () => {
    expect(isMono([1, 1, WILD])).toBe(true);
    expect(isMono([1, 2, WILD])).toBe(false);
    expect(isTubeDone([1, 1, 1, WILD], 4)).toBe(true);
    expect(isTubeDone([1, 2, 1, WILD], 4)).toBe(false);
    expect(isWin(st([[1, 1, 1, WILD], [2, 2, 2, 2], []]))).toBe(true);
  });
});

describe('color filter', () => {
  it('a filtered tube only receives its color (or a wildcard)', () => {
    const s: GameState = { tubes: [[1], [2], [WILD], []], capacity: 4, filters: [null, null, null, 1] };
    expect(canPour(s, 0, 3)).toBe(true); // color 1 enters filter 1
    expect(canPour(s, 1, 3)).toBe(false); // color 2 blocked
    expect(canPour(s, 2, 3)).toBe(true); // wildcard passes (takes color 1)
  });

  it('the filter enters the canonical key (breaks symmetry)', () => {
    const a: GameState = { tubes: [[1], [2]], capacity: 4, filters: [1, null] };
    const b: GameState = { tubes: [[1], [2]], capacity: 4, filters: [null, 1] };
    expect(canonicalKey(a)).not.toBe(canonicalKey(b));
  });
});

describe('hidden bottom', () => {
  it('a pour reveals the source new top and what falls into the destination', () => {
    const s: GameState = {
      tubes: [[5, 6], [6]],
      capacity: 4,
      hidden: [[true, false], [false]],
    };
    // source top (6) already visible; removing it should reveal the 5 at the bottom.
    const a = applyMove(s, 0, 1); // move 6 from [5,6] to [6] → [5] and [6,6]
    expect(a.tubes[0]).toEqual([5]);
    expect(a.hidden![0]).toEqual([false]); // 5 revealed once it becomes the top
    expect(a.hidden![1]).toEqual([false, false]); // the unit that fell = visible
  });

  it('cloneState copies the hidden bottom without aliasing', () => {
    const s: GameState = { tubes: [[1, 2]], capacity: 4, hidden: [[true, true]] };
    const c = cloneState(s);
    c.hidden![0][0] = false;
    expect(s.hidden![0][0]).toBe(true); // original intact
  });
});

describe('alchemy (colors mix)', () => {
  const sa = (tubes: number[][], capacity = 4): GameState => ({ tubes, capacity, alchemy: true });

  it('recipes are symmetric and the wildcard never mixes', () => {
    expect(mixResult(0, 3)).toBe(4); // red + yellow = orange
    expect(mixResult(3, 0)).toBe(4); // symmetric
    expect(mixResult(1, 3)).toBe(2); // blue + yellow = green
    expect(mixResult(0, 1)).toBe(5); // red + blue = purple
    expect(mixResult(2, 4)).toBeNull(); // green + orange: no recipe
    expect(mixResult(0, 0)).toBeNull(); // same color
    expect(mixResult(WILD, 3)).toBeNull(); // wildcard does not mix
  });

  it('only allows the cross pour when alchemy is on', () => {
    const on = sa([[0], [3]]);
    const off = st([[0], [3]]); // no alchemy
    expect(canPour(on, 0, 1)).toBe(true); // red onto yellow (has a recipe)
    expect(canPour(off, 0, 1)).toBe(false); // no alchemy, blocked
    expect(canPour(sa([[2], [4]]), 0, 1)).toBe(false); // pair with no recipe
  });

  it('transmutes the contact and conserves the total unit count', () => {
    // 2 yellows onto 2 blues (cap 4) → whole tube turns green
    const s = sa([[1, 1], [3, 3], []]);
    const a = applyMove(s, 1, 0); // yellow(3) onto blue(1)
    expect(a.tubes[0]).toEqual([2, 2, 2, 2]); // 4 greens
    expect(a.tubes[1]).toEqual([]);
    // conservation: before 2+2 = 4 units; after 4 units
    expect(a.tubes.flat().length).toBe(s.tubes.flat().length);
  });

  it('partial mix transmutes only the contact (k + min(k, run of B))', () => {
    // 1 yellow onto [red, blue, blue] → the yellow + 1 blue at the contact turn green
    const s = sa([[0, 1, 1], [3]], 4);
    const a = applyMove(s, 1, 0); // 1 yellow(3) onto blue(1)
    expect(a.tubes[0]).toEqual([0, 1, 2, 2]); // base intact, contact turns green
    expect(a.tubes[1]).toEqual([]);
  });

  it('filter beats alchemy: an incompatible color is blocked (does not mix)', () => {
    // tube 1 filters yellow(3) and contains yellow; red(0) would make orange, but the filter blocks it.
    const s: GameState = { tubes: [[0], [3]], capacity: 4, alchemy: true, filters: [null, 3] };
    expect(canPour(s, 0, 1)).toBe(false); // red blocked by the filter, no transmutation
  });

  it('generates and solves a level with alchemy on', () => {
    for (let i = 0; i < 4; i++) {
      const lvl = generateLevel({ colors: 5, capacity: 4, emptyTubes: 2, alchemy: true });
      expect(lvl.state.alchemy).toBe(true);
      expect(isSolvable(lvl.state)).toBe(true);
    }
  });

  it('the solver sees the mix as a path to victory', () => {
    // cap 4: 2 blues + 2 yellows scattered; mixing produces green and closes the tube
    const s = sa([[1, 1], [3, 3], []], 4);
    const r = solve(s);
    expect(r.solved).toBe(true);
  });

  it('the flag survives clones: a mandatory-mix level is solvable (and impossible without it)', () => {
    // blue(2) and red(2) never fill a tube on their own (cap 4): they only vanish by becoming secondary.
    // Requires alchemy to persist across the many solver clones.
    const s = sa([[1, 1], [3, 3], [0, 0], [3, 3], []], 4);
    expect(cloneState(s).alchemy).toBe(true); // does not disappear in the clone
    expect(solve(s).solved).toBe(true);
    // without alchemy the same board is IMPOSSIBLE (proves the win depends on mixing)
    const dead: GameState = { tubes: s.tubes.map((t) => t.slice()), capacity: 4 };
    expect(isSolvable(dead)).toBe(false);
  });
});

describe('solver and generator', () => {
  it('solves a simple position and gives the minimal path', () => {
    // capacity 2: each color has exactly 2 units (win = full monochromatic tube)
    const s = st([[0, 1], [1, 0], []], 2);
    const r = solve(s);
    expect(r.solved).toBe(true);
    expect(r.moves!.length).toBeGreaterThan(0);
  });

  it('always generates solvable levels', () => {
    for (let i = 0; i < 5; i++) {
      const lvl = generateLevel({ colors: 5, capacity: 4, emptyTubes: 2 });
      expect(isSolvable(lvl.state)).toBe(true);
    }
  });

  it('generates solvable levels with wildcard, filter and hidden bottom', () => {
    for (let i = 0; i < 4; i++) {
      const wild = generateLevel({ colors: 5, capacity: 4, emptyTubes: 2, wildUnits: 2 });
      expect(wild.state.tubes.flat()).toContain(WILD);
      expect(isSolvable(wild.state)).toBe(true);

      const filt = generateLevel({ colors: 5, capacity: 4, emptyTubes: 3, filterTubes: 1 });
      expect(filt.state.filters?.some((f) => f != null)).toBe(true);
      expect(isSolvable(filt.state)).toBe(true);

      const hid = generateLevel({ colors: 5, capacity: 4, emptyTubes: 2, hiddenTubes: 2, hiddenDepth: 2 });
      expect(hid.state.hidden?.some((h) => h.some(Boolean))).toBe(true);
      expect(isSolvable(hid.state)).toBe(true);
    }
  });

  it('daily challenge: same seed → identical and solvable level', () => {
    const cfg = { colors: 6, capacity: 5, emptyTubes: 2 };
    const seed = seedFromString('2026-06-29');
    const a = generateLevel(cfg, 200, mulberry32(seed));
    const b = generateLevel(cfg, 200, mulberry32(seed));
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.optimalMoves).toBe(b.optimalMoves);
    expect(isSolvable(a.state)).toBe(true);
    // different date → different level (with very high probability)
    const c = generateLevel(cfg, 200, mulberry32(seedFromString('2026-06-30')));
    expect(JSON.stringify(c.state)).not.toBe(JSON.stringify(a.state));
  });
});
