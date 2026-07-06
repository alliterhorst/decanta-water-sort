/**
 * Decanta economy & shop.
 *
 * Principles: a FAIR shop, no dark patterns.
 * - You earn coins by winning; using help earns LESS, but always earns something (guaranteed floor).
 * - The shop sells only COSMETICS (backgrounds + tube styles) and optional EXTRA power-ups
 *   that don't affect the reward or replace the free solution. No pay-to-win.
 *
 * Everything persists in localStorage (with try/catch — Safari private mode may throw).
 */

export type ItemKind = 'bg' | 'tube' | 'shape';

export interface BgTheme {
  id: string;
  // name does NOT live here — it's UI text, translated via t.economy.bg[id] in i18n/locales/*.ts
  // (see src/i18n/types.ts). This object only holds game/config data.
  kind: 'bg';
  price: number;
  /** Background gradient, top to bottom (0xRRGGBB). */
  top: number;
  mid: number;
  deep: number;
}

export interface TubeStyle {
  id: string;
  // name does NOT live here — it's UI text, translated via t.economy.tube[id] (same reason as above).
  kind: 'tube';
  price: number;
  /** Color of the glass outline/highlight (0xRRGGBB). */
  rim: number;
  /** Tint of the glass's inner reflection. */
  tint: number;
}

/** Tube SHAPE cosmetic — the silhouette (bottle, test tube, flask…). The geometry spec lives
 *  in render/geometry.ts (TUBE_SHAPE_SPECS), keyed by this same id; the shop only holds price. */
export interface TubeShapeItem {
  id: string;
  // name is UI text, translated via t.economy.shape[id] in i18n/locales/*.ts.
  kind: 'shape';
  price: number;
}

export type ShopItem = BgTheme | TubeStyle | TubeShapeItem;

/** Backgrounds. The first one is free and comes equipped. */
export const BG_THEMES: BgTheme[] = [
  { id: 'noite', kind: 'bg', price: 0, top: 0x1b2742, mid: 0x101a2e, deep: 0x0b1322 },
  { id: 'oceano', kind: 'bg', price: 60, top: 0x0e3b54, mid: 0x0a2236, deep: 0x06131f },
  { id: 'aurora', kind: 'bg', price: 80, top: 0x14403a, mid: 0x152a3a, deep: 0x0a1622 },
  { id: 'lavanda', kind: 'bg', price: 80, top: 0x2c2350, mid: 0x1e1a3a, deep: 0x100c20 },
  { id: 'sunset', kind: 'bg', price: 100, top: 0x3e2236, mid: 0x2a1830, deep: 0x140e1c },
  { id: 'carvao', kind: 'bg', price: 120, top: 0x252b34, mid: 0x171b23, deep: 0x0c0e13 },
];

/** Tube COLORS (glass tint). The first one is free and comes equipped. */
export const TUBE_STYLES: TubeStyle[] = [
  { id: 'cristal', kind: 'tube', price: 0, rim: 0xe3edff, tint: 0xffffff },
  { id: 'ambar', kind: 'tube', price: 70, rim: 0xffd98a, tint: 0xfff0cc },
  { id: 'esmeralda', kind: 'tube', price: 90, rim: 0x8ff0c0, tint: 0xd6ffe8 },
  { id: 'rose', kind: 'tube', price: 90, rim: 0xffb3cf, tint: 0xffe0ec },
  { id: 'ouro', kind: 'tube', price: 150, rim: 0xffcf66, tint: 0xfff2c8 },
];

/** Tube SHAPES (silhouette). ids match TUBE_SHAPE_SPECS in render/geometry.ts. First is free. */
export const TUBE_SHAPES: TubeShapeItem[] = [
  { id: 'classica', kind: 'shape', price: 0 },
  { id: 'proveta', kind: 'shape', price: 90 },
  { id: 'farmacia', kind: 'shape', price: 110 },
  { id: 'erlenmeyer', kind: 'shape', price: 130 },
  { id: 'balao', kind: 'shape', price: 150 },
];

export interface Wallet {
  coins: number;
  /** IDs of purchased items (free ones count as always owned). */
  owned: string[];
  /** Equipped background cosmetic. */
  bg: string;
  /** Equipped tube color. */
  tube: string;
  /** Equipped tube shape (silhouette). */
  tubeShape: string;
}

const KEY = 'decanta:wallet';
const WALLET_VERSION = 1;
/** Free ids that are ALWAYS owned (even for wallets saved before a category existed). */
const FREE_IDS = ['noite', 'cristal', 'classica'];
const DEFAULTS: Wallet = { coins: 0, owned: [...FREE_IDS], bg: 'noite', tube: 'cristal', tubeShape: 'classica' };

export function loadWallet(): Wallet {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, owned: [...DEFAULTS.owned] };
    const data = JSON.parse(raw) as Record<string, unknown>;
    // Robust per-field migration — supports old schemas without breaking.
    // When WALLET_VERSION increases, check data.v here and migrate renamed/removed fields.
    const w: Wallet = {
      coins: typeof data.coins === 'number' ? Math.max(0, data.coins) : DEFAULTS.coins,
      owned: Array.isArray(data.owned)
        ? data.owned.filter((x): x is string => typeof x === 'string')
        : [...DEFAULTS.owned],
      bg: typeof data.bg === 'string' ? data.bg : DEFAULTS.bg,
      tube: typeof data.tube === 'string' ? data.tube : DEFAULTS.tube,
      // Wallets saved before tube shapes existed fall back to the free classic shape.
      tubeShape: typeof data.tubeShape === 'string' ? data.tubeShape : DEFAULTS.tubeShape,
    };
    // Free IDs always present (even if the old schema didn't have them)
    for (const free of FREE_IDS) if (!w.owned.includes(free)) w.owned.push(free);
    return w;
  } catch {
    return { ...DEFAULTS, owned: [...DEFAULTS.owned] };
  }
}

export function saveWallet(w: Wallet): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...w, v: WALLET_VERSION }));
  } catch {
    /* ignore */
  }
}

/**
 * Coin reward for beating a phase.
 * Base + star bonus; using help reduces it, but NEVER below the floor (the "always earns" principle).
 */
export function rewardFor(opts: {
  mode: 'journey' | 'daily' | 'boss';
  stars: number;
  helps: number; // total help used (undo + hint + tube)
}): number {
  const { mode, stars, helps } = opts;
  const base = mode === 'boss' ? 25 : mode === 'daily' ? 20 : 10;
  const bonus = mode === 'boss' ? 0 : stars * 5; // bosses have no stars
  const penalty = Math.min(helps * 2, base + bonus - 3); // leave at least the floor
  const floor = mode === 'boss' ? 25 : 3;
  return Math.max(floor, base + bonus - Math.max(0, penalty));
}

const ALL = [...BG_THEMES, ...TUBE_STYLES, ...TUBE_SHAPES] as ShopItem[];

export function itemById(id: string): ShopItem | undefined {
  return ALL.find((it) => it.id === id);
}

export function activeBg(w: Wallet): BgTheme {
  return BG_THEMES.find((t) => t.id === w.bg) ?? BG_THEMES[0];
}

export function activeTube(w: Wallet): TubeStyle {
  return TUBE_STYLES.find((t) => t.id === w.tube) ?? TUBE_STYLES[0];
}

export function activeTubeShape(w: Wallet): TubeShapeItem {
  return TUBE_SHAPES.find((t) => t.id === w.tubeShape) ?? TUBE_SHAPES[0];
}
