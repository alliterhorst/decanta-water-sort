/**
 * Mode/palette/generation invariants — regression tests for the 2026-07-09 field bug:
 * extreme mode declared maxColors=9 while the palette had 8 colors, so high extreme phases
 * indexed LIQUID_COLORS[8] → undefined → Pixi crashed ("Unable to convert color undefined")
 * → permanent black screen. On top of that, extreme's single empty tube made high-phase
 * random boards ~0-5% solvable, so the generator burned every attempt and shipped a TRIVIAL
 * pre-solved fallback board.
 */
import { describe, expect, it } from 'vitest';
import { LIQUID_COLORS } from './palette';
import { MODES } from './modes';
import { levelConfig } from './levels';
import { generateLevel, mulberry32 } from '../core/generator';
import type { JourneyMode } from './modes';

const ALL_MODES = Object.keys(MODES) as JourneyMode[];

describe('palette covers every mode', () => {
  it('has at least max(maxColors) liquid colors', () => {
    const needed = Math.max(...ALL_MODES.map((m) => MODES[m].maxColors));
    expect(LIQUID_COLORS.length).toBeGreaterThanOrEqual(needed);
  });

  it('every phase config stays within the palette (phases 0..300, all modes)', () => {
    for (const mode of ALL_MODES) {
      for (let phase = 0; phase <= 300; phase++) {
        const cfg = levelConfig(phase, mode);
        expect(cfg.colors, `${mode} phase ${phase}`).toBeLessThanOrEqual(LIQUID_COLORS.length);
      }
    }
  });
});

describe('high phases generate REAL puzzles (never the trivial pre-solved fallback)', () => {
  // Fixed seeds keep this deterministic and fast; 60 attempts is far above what a healthy
  // config needs (a 100%-solvable config succeeds on the 1st or 2nd attempt).
  const HIGH_PHASES = [108, 150, 151, 152, 153, 154, 155];

  for (const mode of ALL_MODES) {
    it(`${mode}: phases ${HIGH_PHASES[0]}-${HIGH_PHASES[HIGH_PHASES.length - 1]}`, () => {
      for (const phase of HIGH_PHASES) {
        const cfg = levelConfig(phase, mode);
        const lvl = generateLevel(cfg, 60, mulberry32(4242 + phase));
        // optimalMoves === 0 means the solvable-by-construction fallback: a board that is
        // already won on load — a broken player experience.
        expect(lvl.optimalMoves, `${mode} phase ${phase} produced a trivial board`).toBeGreaterThan(0);
      }
    });
  }
});

describe('no tube ever STARTS complete, and no phase spawns a locked/corked tube (direction rules)', () => {
  // Two field reports collapsed into one invariant. A cork reads as "finished bottle", so:
  //  1. no tube may spawn complete (full + single color) — an already-solved tube feels like a
  //     bug and removes a tube from play (report 2026-07-09);
  //  2. the generator must place NO locked/corked tubes at all — a cork on a mixed, unfinished
  //     bottle is absurd (report 2026-07-10). The lock INFRASTRUCTURE stays dormant in the code
  //     for a possible future non-cork "frozen tube" mechanic, but levelConfig must never request
  //     one, so no cork ever appears at phase start.
  // Cover the whole cycle (steps 0-5) across high tiers where mechanics are fully unlocked.
  const CASES: Array<[JourneyMode, number]> = [];
  for (const mode of ALL_MODES) for (const base of [18, 24, 150]) for (let step = 0; step < 6; step++) {
    CASES.push([mode, base + step]);
  }
  const SEEDS = 12;

  for (const [mode, phase] of CASES) {
    it(`${mode} phase ${phase}: ${SEEDS} seeds`, () => {
      const cfg = levelConfig(phase, mode);
      expect(cfg.lockedTubes ?? 0, `${mode} ph${phase}: no locked tubes may be configured`).toBe(0);
      for (let s = 0; s < SEEDS; s++) {
        const lvl = generateLevel(cfg, 60, mulberry32(7100 + phase * 101 + s));
        const { tubes, locks = [], capacity } = lvl.state;
        // (a) NO tube starts complete (uniform + full)
        for (let i = 0; i < tubes.length; i++) {
          const t = tubes[i];
          const complete = t.length === capacity && t[0] >= 0 && t.every((c) => c === t[0]);
          expect(complete, `${mode} ph${phase} seed${s}: tube ${i} spawned complete`).toBe(false);
        }
        // (b) NO tube is corked/locked at spawn
        expect(locks.some((v) => v > 0), `${mode} ph${phase} seed${s}: a tube spawned locked`).toBe(false);
        // (c) still a REAL solvable puzzle (solver validated the final board)
        expect(lvl.optimalMoves, `${mode} ph${phase} seed${s}: trivial/unsolvable`).toBeGreaterThan(0);
      }
    });
  }
});
