import type { LevelConfig } from '../core/generator';

export interface BossData {
  id: string;
  // name/title/lore/ability do NOT live here — they're UI text, translated via t.boss[id] in
  // i18n/locales/*.ts (see src/i18n/types.ts). This object only holds game/config data.
  tier: number;
  levelConfig: LevelConfig;
  themeDeep: number;
  rimColor: number;
  reward: number;
  floodInterval: number; // moves between each "flood" (0 = disabled)
  floodCount: number;    // how many drops fall per flood
  portraitGradient: string;
  portraitAccent: string;
}

export const BOSSES: BossData[] = [
  {
    id: 'engarrafador',
    tier: 0,
    levelConfig: { colors: 6, capacity: 5, emptyTubes: 2 },
    themeDeep: 0x12052a,
    rimColor: 0xc084fc,
    reward: 60,
    floodInterval: 5,
    floodCount: 1,
    portraitGradient: 'linear-gradient(160deg,#1e0a3e 0%,#3b0764 60%,#7e22ce 100%)',
    portraitAccent: '#c084fc',
  },
  {
    id: 'alquimista',
    tier: 1,
    levelConfig: { colors: 7, capacity: 5, emptyTubes: 2 },
    themeDeep: 0x042010,
    rimColor: 0x4ade80,
    reward: 80,
    floodInterval: 4,
    floodCount: 2,
    portraitGradient: 'linear-gradient(160deg,#052e16 0%,#14532d 60%,#166534 100%)',
    portraitAccent: '#4ade80',
  },
  {
    id: 'oceano',
    tier: 2,
    levelConfig: { colors: 8, capacity: 5, emptyTubes: 3 },
    themeDeep: 0x020b18,
    rimColor: 0x38bdf8,
    reward: 100,
    floodInterval: 3,
    floodCount: 3,
    portraitGradient: 'linear-gradient(160deg,#0c1a2e 0%,#0c4a6e 60%,#0369a1 100%)',
    portraitAccent: '#38bdf8',
  },
];

export function bossForTier(tier: number): BossData | undefined {
  return BOSSES.find(b => b.tier === tier);
}

/**
 * Returns the boss that should appear AFTER completing this phase.
 * A boss appears when completing the last phase of each tier (phase 5, 11, 17, 23...) —
 * FOREVER: past the three introductions, the roster cycles (tier % 3), so the fights
 * keep coming every 6 phases and rotate between the three bosses without ever
 * repeating back-to-back. (Before this, bossForTier(3+) returned undefined and no boss
 * ever appeared again after phase 17 — a real player-reported loss.)
 */
export function bossAfterPhase(phase: number): BossData | undefined {
  if ((phase + 1) % 6 !== 0) return undefined;
  const tier = Math.floor((phase + 1) / 6) - 1;
  return bossForTier(tier % BOSSES.length);
}
