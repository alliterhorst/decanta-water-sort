/**
 * Pure liquid geometry — NO Pixi dependency (testable, portable).
 *
 * The core idea that fixes the classic bug ("liquid turns into a rigid block when tilted"):
 * the liquid SURFACE is always HORIZONTAL in WORLD space (gravity). The glass rotates; the
 * liquid flows. To achieve this, we compute the "waterlines" (world-Y) by VOLUME over the
 * tube's inner polygon ALREADY transformed into world space. Since rotation preserves area,
 * the per-unit volume is invariant — colors can never get "shuffled".
 */

export interface V2 {
  x: number;
  y: number;
}

export interface Pose {
  cx: number;
  cy: number;
  angle: number; // radians; 0 = upright. Rotates around the tube's CENTER.
}

export interface TubeShape {
  /** Inner polygon in LOCAL coords (origin at tube center, y down). */
  poly: V2[];
  wi: number;     // inner body width
  hInt: number;   // inner height
  rb: number;     // rounded-bottom radius (= wi/2)
  rt: number;     // legacy — unused for the bottle
  neckWi: number; // inner neck width
  neckRt: number; // mouth corner radius (interior)
}

/**
 * Polygon for a "tube" (semicircular rounded bottom, straight/open top), centered at
 * (0,0), y down. Width `w`, height `h`. The bottom radius is w/2. Used both for the outer
 * glass and for the interior (liquid clip).
 */
/** @deprecated Kept for reference — use bottlePoly for the bottle visual. */
export const TOP_CORNER = 0.13;

/** @deprecated Use bottlePoly. */
export function roundedTubePoly(w: number, h: number, segs = 28): V2[] {
  const rb = w / 2;
  const rt = w * TOP_CORNER;
  const top = -h / 2;
  const yBot = h / 2 - rb;
  const poly: V2[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      poly.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  arc(-w / 2 + rt, top + rt, rt, Math.PI, Math.PI * 1.5, 8);
  arc(w / 2 - rt, top + rt, rt, Math.PI * 1.5, Math.PI * 2, 8);
  arc(0, yBot, rb, 0, Math.PI, segs);
  return poly;
}

// ---- Stylized bottle (shoulder + neck + headspace) ----

/** Fraction of the body used as the neck width (exterior). */
export const NECK_RATIO = 0.46;
/** Fraction of the height (from the top) where the neck ends and the shoulder begins. */
export const SHOULDER_TOP = 0.26;
/** Fraction of the height (from the top) where the shoulder ends and the body begins. */
export const SHOULDER_BOT = 0.40;

/**
 * Stylized bottle polygon: narrow neck + S-curve shoulder + wide body + rounded bottom.
 * Centered at (0,0), y down. `neckRatio` = neck width / body width.
 */
export function bottlePoly(w: number, h: number, neckRatio = NECK_RATIO, segs = 28): V2[] {
  const nw = w * neckRatio;          // neck width
  const nt = nw * 0.11;              // mouth corner radius
  const rb = w / 2;                  // bottom radius (semicircle)
  const top = -h / 2;
  const shoulderTopY = top + h * SHOULDER_TOP;  // where the neck meets the shoulder
  const shoulderBotY = top + h * SHOULDER_BOT;  // where the shoulder meets the body
  const bodyBotY = h / 2 - rb;       // center of the bottom arc
  const SHOULDER_SEGS = 10;
  const smooth = (t: number) => (1 - Math.cos(t * Math.PI)) / 2; // S-curve 0→1

  const poly: V2[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      poly.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };

  // Clockwise in y-down:
  // top-left neck corner (180°→270°)
  arc(-nw / 2 + nt, top + nt, nt, Math.PI, Math.PI * 1.5, 5);
  // top-right neck corner (270°→360°)
  arc(nw / 2 - nt, top + nt, nt, Math.PI * 1.5, Math.PI * 2, 5);
  // right side of the neck (vertical, going down)
  poly.push({ x: nw / 2, y: shoulderTopY });
  // right shoulder — S-curve from neck to body
  for (let i = 1; i <= SHOULDER_SEGS; i++) {
    const t = i / SHOULDER_SEGS;
    poly.push({ x: nw / 2 + (w / 2 - nw / 2) * smooth(t), y: shoulderTopY + (shoulderBotY - shoulderTopY) * t });
  }
  // right side of the body (vertical, going down)
  poly.push({ x: w / 2, y: bodyBotY });
  // rounded bottom (right→left along the bottom)
  arc(0, bodyBotY, rb, 0, Math.PI, segs);
  // left side of the body (vertical, going up)
  poly.push({ x: -w / 2, y: shoulderBotY });
  // left shoulder — S-curve from body to neck (mirrored)
  for (let i = 1; i <= SHOULDER_SEGS; i++) {
    const t = i / SHOULDER_SEGS;
    poly.push({ x: -(nw / 2 + (w / 2 - nw / 2) * smooth(1 - t)), y: shoulderBotY - (shoulderBotY - shoulderTopY) * t });
  }
  // left side of the neck closes back to the start of the top-left arc

  return poly;
}

/**
 * INNER bottle polygon (where the liquid lives), centered at (0,0).
 * OUTER dimensions → subtracts ~6% wall thickness from each side.
 */
export function buildTubeShape(tubeW: number, tubeH: number, segs = 28): TubeShape {
  const t = tubeW * 0.02; // reduced inset: liquid reaches close to the visual edge
  const wi = tubeW - 2 * t;
  const hInt = tubeH - t;
  const nwOuter = tubeW * NECK_RATIO;
  const neckWi = nwOuter - 2 * t;
  const neckRatioInner = neckWi / wi;
  const neckRt = neckWi * 0.11;
  return {
    poly: bottlePoly(wi, hInt, neckRatioInner, segs),
    wi,
    hInt,
    rb: wi / 2,
    rt: wi * TOP_CORNER, // legacy
    neckWi,
    neckRt,
  };
}

/** Transforms a local point into world space by applying the pose (rotation around the center). */
export function toWorld(p: V2, pose: Pose): V2 {
  const c = Math.cos(pose.angle);
  const s = Math.sin(pose.angle);
  return { x: pose.cx + p.x * c - p.y * s, y: pose.cy + p.x * s + p.y * c };
}

/** Whole polygon transformed into world space. */
export function polyToWorld(poly: V2[], pose: Pose): V2[] {
  return poly.map((p) => toWorld(p, pose));
}

/** Area (shoelace formula), always positive. Invariant to rotation/translation. */
export function shoelace(poly: V2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Clips the polygon against a horizontal line y = yLine (Sutherland–Hodgman).
 * keepBelow = true keeps the part BELOW (y >= yLine, in the y-down convention).
 */
export function clipH(poly: V2[], yLine: number, keepBelow: boolean): V2[] {
  const out: V2[] = [];
  const n = poly.length;
  if (n === 0) return out;
  const inside = (p: V2) => (keepBelow ? p.y >= yLine : p.y <= yLine);
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const ain = inside(a);
    const bin = inside(b);
    if (ain) out.push(a);
    if (ain !== bin) {
      const tt = (yLine - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * tt, y: yLine });
    }
  }
  return out;
}

/** Area of the polygon BELOW the line y = yLine (the "submerged" part). */
export function submergedArea(poly: V2[], yLine: number): number {
  const c = clipH(poly, yLine, true);
  return c.length < 3 ? 0 : shoelace(c);
}

/** Smallest and largest y of the polygon. */
export function yBounds(poly: V2[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  return { min, max };
}

/**
 * Waterline (world-Y) such that the area below it ≈ `targetArea`.
 * Binary search: area-below is monotonically decreasing in yLine.
 */
export function waterline(poly: V2[], targetArea: number, iters = 40): number {
  const { min, max } = yBounds(poly);
  if (targetArea <= 0) return max; // no volume → surface at the bottom
  const total = shoelace(poly);
  if (targetArea >= total) return min; // full → surface at the top
  let lo = min;
  let hi = max;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (submergedArea(poly, mid) > targetArea) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Band {
  color: number; // index into LIQUID_COLORS, or WILD (-1)
  len: number; // number of contiguous units
}

export interface BandLevels {
  /** world-Y of the SURFACE (top) of each band, from the bottom (i=0) up. Decreasing in i. */
  surfaceY: number[];
  colors: number[]; // color per band (aligned with surfaceY)
  bottomY: number; // world-Y of the lowest liquid point (tube bottom)
  unitVol: number; // area per unit (invariant to rotation)
}

/**
 * Groups a tube (list of colors bottom→top) into contiguous bands and computes each one's
 * waterline, in WORLD space. `worldPoly` is the interior already transformed by the pose.
 *
 * `capVolume` = MAXIMUM retainable volume (area below the overflow lip). Anything beyond it
 * "spills": each band's accumulated volume is clamped to that ceiling, so the top color
 * (the last one poured) disappears first as the tube tilts — exactly like in real life.
 */
export function computeBandLevels(
  worldPoly: V2[],
  capacity: number,
  tube: number[],
  capVolume = Infinity,
): BandLevels {
  const total = shoelace(worldPoly);
  const unitVol = total / capacity;
  const { max } = yBounds(worldPoly);
  const runs: Band[] = [];
  for (const c of tube) {
    const last = runs[runs.length - 1];
    if (last && last.color === c) last.len++;
    else runs.push({ color: c, len: 1 });
  }
  const surfaceY: number[] = [];
  const colors: number[] = [];
  let cum = 0;
  for (const r of runs) {
    cum += r.len;
    surfaceY.push(waterline(worldPoly, Math.min(cum * unitVol, capVolume)));
    colors.push(r.color);
  }
  return { surfaceY, colors, bottomY: max, unitVol };
}
