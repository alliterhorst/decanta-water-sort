/** Decanta palette. Vector art, harmonious + accessible colors. */
export const BG = 0x101a2e; // top of the scene gradient
export const BG_DEEP = 0x0b1322; // bottom of the gradient / shadows
export const BG_PANEL = 0x1a2740; // panels and modals
export const GLOW = 0x1c2a44; // bench light behind the tubes
export const GLASS = 0xe3edff;
export const TEXT = 0xeef4ff;
export const TEXT_DIM = 0xa6b8d8;
export const ACCENT = 0x5ad1c4;
export const GOLD = 0xffcf66; // coins, victory, "full tube"

/**
 * Liquid colors (8). Staggered in luminance (a brightness ladder) so they stay distinct
 * even under color blindness — risky pairs (red/green, orange/yellow) sit on different steps.
 */
export const LIQUID_COLORS: number[] = [
  0xe63950, // 0 cherry red (mid-low)
  0x3a86ff, // 1 blue (mid)
  0x2fb84d, // 2 green (mid-high)
  0xffd60a, // 3 yellow (high)
  0xff7a1a, // 4 orange (mid-high)
  0x8a4fe0, // 5 purple (low)
  0xff8fc5, // 6 pink (high-light)
  0x19c7d6, // 7 cyan (mid-high)
];

export function lighten(hex: number, amt: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return (
    (Math.round(r + (255 - r) * amt) << 16) |
    (Math.round(g + (255 - g) * amt) << 8) |
    Math.round(b + (255 - b) * amt)
  );
}

export function darken(hex: number, amt: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return (
    (Math.round(r * (1 - amt)) << 16) |
    (Math.round(g * (1 - amt)) << 8) |
    Math.round(b * (1 - amt))
  );
}
