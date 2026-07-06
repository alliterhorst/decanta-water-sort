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

// ---- Configurable tube shapes (neck + shoulder + body + bottom) ----

/**
 * Parameters that define a tube SILHOUETTE. The liquid levels by AREA over the interior
 * polygon (rotation preserves area), so EVERY shape works with the exact same mechanic —
 * only the outline changes. The shop sells these as "tube shapes" (see economy.ts).
 */
export interface TubeShapeSpec {
  /** Neck width / body width (the mouth opening). */
  neckRatio: number;
  /** Fraction of the height (from the top) where the neck ends and the shoulder begins. */
  shoulderTop: number;
  /** Fraction of the height (from the top) where the shoulder ends and the body begins. */
  shoulderBot: number;
  /** Body half-width just below the shoulder, relative to the full width. 1 = straight body;
   *  < 1 = the body WIDENS toward the base (conical, e.g. an Erlenmeyer flask). */
  bodyTopRatio: number;
  /** Bottom roundness: 1 = full semicircle; < 1 = flatter base (semi-ellipse). */
  bottomRound: number;
}

/** Classic-bottle constants (kept as the free default shape). */
export const NECK_RATIO = 0.46;
export const SHOULDER_TOP = 0.26;
export const SHOULDER_BOT = 0.40;

/** The default free shape — the classic bottle the game shipped with. */
export const CLASSIC_SHAPE: TubeShapeSpec = {
  neckRatio: NECK_RATIO, shoulderTop: SHOULDER_TOP, shoulderBot: SHOULDER_BOT,
  bodyTopRatio: 1, bottomRound: 1,
};

/** Catalog of tube silhouettes (id → spec). The shop sells these by id (economy.ts TUBE_SHAPES). */
export const TUBE_SHAPE_SPECS: Record<string, TubeShapeSpec> = {
  classica:   CLASSIC_SHAPE,
  // straight cylinder, wide mouth, deep U bottom — a lab test tube
  proveta:    { neckRatio: 0.82, shoulderTop: 0.05, shoulderBot: 0.12, bodyTopRatio: 1.0,  bottomRound: 1.0 },
  // conical Erlenmeyer: narrow top, widens to the base, flatter bottom
  erlenmeyer: { neckRatio: 0.40, shoulderTop: 0.12, shoulderBot: 0.23, bodyTopRatio: 0.42, bottomRound: 0.5 },
  // long slim neck + bulbous body — a distillation flask
  balao:      { neckRatio: 0.28, shoulderTop: 0.40, shoulderBot: 0.56, bodyTopRatio: 0.80, bottomRound: 1.0 },
  // apothecary jar: short shoulder, near-straight body, flat base
  farmacia:   { neckRatio: 0.58, shoulderTop: 0.10, shoulderBot: 0.20, bodyTopRatio: 0.96, bottomRound: 0.34 },
};

/** Elliptic arc into `poly` (rx = ry gives a circular arc; rx ≠ ry the flatter bottom). */
function ellArc(poly: V2[], cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): void {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    poly.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
}

/**
 * Silhouette polygon for a tube, centered at (0,0), y down, width `w`, height `h`:
 * neck → S-curve shoulder → (optionally tapered) body → rounded/flat bottom.
 */
export function bottlePoly(w: number, h: number, spec: TubeShapeSpec = CLASSIC_SHAPE, segs = 28): V2[] {
  const nw = w * spec.neckRatio;         // neck width
  const nt = nw * 0.11;                   // mouth corner radius
  const rb = (w / 2) * spec.bottomRound;  // bottom vertical radius (semi-ellipse height)
  const top = -h / 2;
  const shoulderTopY = top + h * spec.shoulderTop;
  const shoulderBotY = top + h * spec.shoulderBot;
  const bodyHalf = (w / 2) * spec.bodyTopRatio; // half-width just below the shoulder
  const bodyBotY = h / 2 - rb;            // where the body meets the bottom arc
  const SHOULDER_SEGS = 10;
  const smooth = (t: number) => (1 - Math.cos(t * Math.PI)) / 2; // S-curve 0→1

  const poly: V2[] = [];
  // Clockwise in y-down:
  ellArc(poly, -nw / 2 + nt, top + nt, nt, nt, Math.PI, Math.PI * 1.5, 5);   // top-left neck corner
  ellArc(poly, nw / 2 - nt, top + nt, nt, nt, Math.PI * 1.5, Math.PI * 2, 5); // top-right neck corner
  poly.push({ x: nw / 2, y: shoulderTopY });                                  // right neck side down
  for (let i = 1; i <= SHOULDER_SEGS; i++) {                                   // right shoulder S-curve
    const t = i / SHOULDER_SEGS;
    poly.push({ x: nw / 2 + (bodyHalf - nw / 2) * smooth(t), y: shoulderTopY + (shoulderBotY - shoulderTopY) * t });
  }
  poly.push({ x: w / 2, y: bodyBotY });                                        // right body → base (linear taper)
  ellArc(poly, 0, bodyBotY, w / 2, rb, 0, Math.PI, segs);                      // bottom (right → left)
  poly.push({ x: -bodyHalf, y: shoulderBotY });                               // left body base → top
  for (let i = 1; i <= SHOULDER_SEGS; i++) {                                   // left shoulder S-curve (mirrored)
    const t = i / SHOULDER_SEGS;
    poly.push({ x: -(nw / 2 + (bodyHalf - nw / 2) * smooth(1 - t)), y: shoulderBotY - (shoulderBotY - shoulderTopY) * t });
  }
  return poly;
}

/**
 * Left inner profile (top→bottom), inset by `ins` — used for the glass rim-light highlight so
 * it hugs ANY shape, not just the classic bottle.
 */
export function bottleProfileLeft(w: number, h: number, spec: TubeShapeSpec, ins: number, segs = 10): V2[] {
  const nw = w * spec.neckRatio;
  const nt = nw * 0.11;
  const rb = (w / 2) * spec.bottomRound;
  const top = -h / 2;
  const shoulderTopY = top + h * spec.shoulderTop;
  const shoulderBotY = top + h * spec.shoulderBot;
  const bodyHalf = (w / 2) * spec.bodyTopRatio;
  const bodyBotY = h / 2 - rb;
  const smooth = (t: number) => (1 - Math.cos(t * Math.PI)) / 2;
  const pts: V2[] = [];
  pts.push({ x: -nw / 2 + ins, y: top + nt });          // top of the left neck
  pts.push({ x: -nw / 2 + ins, y: shoulderTopY });       // base of the left neck
  for (let i = 1; i <= segs; i++) {                       // left shoulder S-curve
    const t = i / segs;
    pts.push({ x: -(nw / 2 + (bodyHalf - nw / 2) * smooth(t)) + ins, y: shoulderTopY + (shoulderBotY - shoulderTopY) * t });
  }
  pts.push({ x: -w / 2 + ins, y: bodyBotY });            // base of the left body
  for (let i = 1; i <= 10; i++) {                          // left quarter of the bottom ellipse (180°→90°)
    const a = Math.PI - (Math.PI / 2) * (i / 10);
    pts.push({ x: (w / 2 - ins) * Math.cos(a), y: bodyBotY + (rb - ins) * Math.sin(a) });
  }
  return pts;
}

/**
 * INNER tube polygon (where the liquid lives), centered at (0,0).
 * OUTER dimensions → subtracts wall thickness from each side.
 */
export function buildTubeShape(tubeW: number, tubeH: number, spec: TubeShapeSpec = CLASSIC_SHAPE, segs = 28): TubeShape {
  const t = tubeW * 0.02; // reduced inset: liquid reaches close to the visual edge
  const wi = tubeW - 2 * t;
  const hInt = tubeH - t;
  const nwOuter = tubeW * spec.neckRatio;
  const neckWi = nwOuter - 2 * t;
  const neckRatioInner = neckWi / wi;
  const neckRt = neckWi * 0.11;
  return {
    poly: bottlePoly(wi, hInt, { ...spec, neckRatio: neckRatioInner }, segs),
    wi,
    hInt,
    rb: wi / 2,
    rt: wi * TOP_CORNER, // legacy
    neckWi,
    neckRt,
  };
}

/** SVG path string of a silhouette, normalized into a [0..vw]×[0..vh] viewBox (for shop swatches). */
export function tubeSvgPath(spec: TubeShapeSpec, vw: number, vh: number, pad = 2): string {
  const w = vw - 2 * pad;
  const h = vh - 2 * pad;
  const pts = bottlePoly(w, h, spec, 22);
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + vw / 2).toFixed(2)},${(p.y + vh / 2).toFixed(2)}`)
    .join(' ') + ' Z';
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
