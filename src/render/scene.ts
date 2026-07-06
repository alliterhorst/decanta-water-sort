/**
 * Pixi scene for Decanta — renders the tube, liquid, pour, and interaction.
 *
 * Z-order across global layers so the liquid (always horizontal, in WORLD coords) sits
 * between the back glass and the front glass, with the stream on top of everything:
 *   glassBack (rotates with tube) → liquid (world, does NOT rotate) → glassFront (rotates with tube) → stream
 *
 * Pour: the source tube rises and tilts over its MOUTH until the lip rests above the mouth of
 * the destination (it passes OVER the others, but does NOT overshoot the destination). The liquid
 * overflows past the lip (capped by volume) while the destination fills; a stream + particles
 * connect the two.
 */
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import { BG_DEEP, GLASS, GOLD, LIQUID_COLORS, lighten } from '../game/palette';
import { WILD } from '../core/types';
import type { GameState } from '../core/types';
import { canPour, pourAmount, applyMove, isWin, cloneState } from '../core/engine';
import { solverClient } from '../core/worker/client';
import {
  buildTubeShape,
  bottlePoly,
  bottleProfileLeft,
  polyToWorld,
  toWorld,
  clipH,
  shoelace,
  submergedArea,
  waterline,
  computeBandLevels,
  CLASSIC_SHAPE,
  type TubeShapeSpec,
  type Pose,
  type TubeShape,
  type V2,
} from './geometry';

const WILD_COLOR = 0xdfe7f5;
const HIDDEN_UNIT = -2; // local render sentinel (unit with a hidden bottom)
const HIDDEN_COLOR = 0x2a3355; // very dark blue — "unknown"
const ASPECT = 2.6; // tubeH / tubeW
const HEADSPACE_VOL_FRAC = 0.93; // 7% of air headspace at the top of the bottle

function flat(poly: V2[]): number[] {
  const out: number[] = [];
  for (const p of poly) out.push(p.x, p.y);
  return out;
}

export interface LayoutResult {
  tubeW: number;
  tubeH: number;
  centers: V2[];
}

/**
 * RESPONSIVE layout: picks how many tubes per row and the tube size so that the ENTIRE
 * grid fits inside the viewport (width AND height), with margins for the HUD (top) and controls (bottom).
 * Guarantees no tube ever ends up off-screen — at any size.
 */
export function computeLayout(
  count: number, vw: number, vh: number,
  hudTop?: number, hudBottom?: number,
): LayoutResult {
  const marginX = Math.max(14, vw * 0.05);
  const marginTop = hudTop ?? Math.max(80, vh * 0.14);
  const marginBottom = hudBottom ?? Math.max(88, vh * 0.14);
  const availW = Math.max(80, vw - 2 * marginX);
  const availH = Math.max(120, vh - marginTop - marginBottom);
  const gapXf = 0.5;
  const gapYf = 0.45;

  // Search for the split (tubes per row) that maximizes tube size while fitting on both axes.
  let best = { perRow: 1, rows: count, tubeW: 0 };
  for (let perRow = Math.min(count, 7); perRow >= 1; perRow--) {
    const rows = Math.ceil(count / perRow);
    const twByW = availW / (perRow + gapXf * (perRow - 1));
    const thByH = availH / (rows + gapYf * (rows - 1));
    const twByH = thByH / ASPECT;
    const tubeW = Math.min(twByW, twByH);
    if (tubeW > best.tubeW) best = { perRow, rows, tubeW };
  }

  const tubeW = best.tubeW;
  const tubeH = tubeW * ASPECT;
  const gapX = tubeW * gapXf;
  const gapY = tubeH * gapYf;
  const gridH = best.rows * tubeH + (best.rows - 1) * gapY;
  // Anchor the grid more toward the TOP when there are many rows (avoids dead space under the
  // HUD), but move toward vertical centering when there are few rows (1-2) — otherwise a large
  // empty gap is left below the grid on tall/mobile screens.
  const anchorF = best.rows <= 1 ? 0.5 : best.rows === 2 ? 0.4 : 0.28;
  const startY = marginTop + (availH - gridH) * anchorF + tubeH / 2;

  const centers: V2[] = [];
  for (let r = 0; r < best.rows; r++) {
    const inRow = Math.min(best.perRow, count - r * best.perRow);
    const rowW = inRow * tubeW + (inRow - 1) * gapX;
    const startX = (vw - rowW) / 2 + tubeW / 2;
    for (let k = 0; k < inRow; k++) {
      centers.push({ x: startX + k * (tubeW + gapX), y: startY + r * (tubeH + gapY) });
    }
  }
  return { tubeW, tubeH, centers };
}

export class Scene {
  readonly app = new Application();
  private glassBack = new Container();
  private liquid = new Container();
  private glassFront = new Container();
  private lift = new Container(); // tube in motion (pour) — OPAQUE unit above everything
  private streamLayer = new Container();
  private capLayer = new Container(); // caps above everything
  private shadowLayer = new Container(); // grounding shadow below the tubes
  private hintLayer = new Container(); // visual hint — pulsing highlight

  // ---- GC/memory: persistent Graphics (pattern "1 Graphics + clear() per frame") ----
  // Layers redrawn EVERY frame (caps/shadows/hints) draw into a single pooled Graphics —
  // zero allocation/destroy per frame. The stream uses one Graphics per active pour (streamG).
  private capG = new Graphics();
  private shadowG = new Graphics();
  private hintG = new Graphics();
  private streamG = new Map<number, Graphics>(); // pool: 1 Graphics per pouring source tube

  // Tracks active pours to allow chaining and skipping
  private activePours = new Map<number, { tl: gsap.core.Timeline; to: number; k: number }>();

  private shape!: TubeShape;
  private outerLocal!: V2[];
  private interiorLocal!: V2[];
  /** Equipped tube silhouette (shop cosmetic). Drives every glass/liquid/pour geometry. */
  private shapeSpec: TubeShapeSpec = CLASSIC_SHAPE;

  // Icons for hidden units ("?") and WILDs ("✦") — one Container PER TUBE (hiddenC[i]),
  // a child of the global hiddenLayer (above liquid, below glassFront). Positions are updated
  // PER FRAME in updateHiddenIcons() (called by drawLiquid), using a per-tube Text pool — the
  // icons follow the tube (selection/drag/pour) as an attribute of it.
  private hiddenLayer = new Container();
  private hiddenC: Container[] = [];
  private iconStyleQ!: TextStyle;
  private iconStyleW!: TextStyle;
  tubeW = 0;
  tubeH = 0;

  state: GameState = { tubes: [], capacity: 4 };
  private centers: V2[] = []; // rest positions
  private poses: Pose[] = [];
  private backG: Container[] = [];
  private frontG: Container[] = [];
  private liquidG: Graphics[] = [];
  /** array override for rendering during a pour (the source stays full until the end). */
  private renderTubes: (number[] | null)[] = [];
  /** visible volume ceiling (in units) per tube, to animate filling/draining. */
  private fillCap: (number | null)[] = [];

  private selected: number | null = null;
  private busy = new Set<number>();
  private pourSources = new Set<number>(); // source tubes in a pour (they are in the lift — shadow removed)
  moves = 0;
  helps = 0;
  optimalMoves = 0;
  private glassColor = GLASS;
  private history: GameState[] = [];
  private hintFrom: number | null = null;
  private hintTo: number | null = null;
  onChange?: (info: {
    moves: number; won: boolean; canUndo: boolean; deadlocked: boolean;
    undosLeft: number; hintsLeft: number; tubesLeft: number;
  }) => void;

  private time = 0;
  qualityLevel: 'low' | 'high' = 'high';
  private frameCount = 0;
  private frameTimeAccum = 0;
  private qualityDetected = false;

  // Boss flood
  private bossActive = false;
  private bossFloodInterval = 0;
  private bossFloodCounter = 0;
  private bossFloodCount = 1;
  /** Level epoch: setLevel() increments it. In-flight flood swaps capture the epoch and
   *  NEVER apply state if it changed (restart/next level during the drop animation). */
  private floodEpoch = 0;
  onFlood?: (tubeIdx: number, color: number) => void;
  onPour?: (durationSec: number) => void;
  onTubeComplete?: (tubeIdx: number, color: number) => void;

  // Wild tutorial callback
  onFirstWild?: () => void;
  private wildShownThisLevel = false;

  // Power-up limits (−1 = unlimited)
  maxUndos = -1;
  maxHints = -1;
  maxExtraTubes = -1;
  private undoUsed = 0;
  private hintUsed = 0;
  private extraTubeUsed = 0;

  // 7.9: drag-and-drop
  private dragTube: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffX = 0;
  private dragOffY = 0;
  private dragMoved = false;
  private dragInLift = false;
  private readonly DRAG_THRESHOLD = 12;

  async init(canvas: HTMLCanvasElement, initialPerfMode: 'auto' | 'low' | 'high' = 'auto'): Promise<void> {
    // Weak-hardware detection — before app.init so we can tune antialias and resolution.
    const weakHW = (navigator.hardwareConcurrency ?? 4) < 4
      || /Android [1-6]\.|Android 7\.0|Android 7\.1/.test(navigator.userAgent);
    if (initialPerfMode === 'low' || (initialPerfMode === 'auto' && weakHW)) {
      this.qualityLevel = 'low';
      this.qualityDetected = true;
    }

    const useLowQuality = this.qualityLevel === 'low';
    await this.app.init({
      canvas,
      resizeTo: window,
      antialias: !useLowQuality,
      resolution: useLowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      backgroundColor: BG_DEEP,
      preference: 'webgl',
      // Dev/QA only: lets direct canvas drawImage/toDataURL captures work. It costs real GPU
      // memory per frame on phones, and the documented QA path (renderer.extract.canvas)
      // re-renders into its own texture — it does NOT need the drawing buffer preserved.
      preserveDrawingBuffer: !import.meta.env.PROD,
    });

    // WebGL context loss: under memory/GPU pressure (exactly the high-phase scenario) the
    // browser can drop the context — without handling, the canvas goes PERMANENTLY black and
    // only closing/reopening the app recovers (real field report). preventDefault() opts into
    // restoration; if the driver doesn't restore within 3s, ONE guarded reload recovers the
    // game (the session is autosaved on every move, so the player resumes where they were).
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      window.setTimeout(() => {
        const gl = (this.app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
        if (gl && !gl.isContextLost()) return; // restored in time — Pixi rebuilds GPU state
        const KEY = 'decanta:ctxlost-reload';
        let last = 0;
        try { last = Number(sessionStorage.getItem(KEY) ?? 0); } catch { /* ignore */ }
        if (Date.now() - last > 60_000) { // never reload-loop on a device that keeps dropping
          try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
          window.location.reload();
        }
      }, 3000);
    });
    this.app.stage.addChild(this.shadowLayer, this.glassBack, this.liquid, this.hiddenLayer, this.glassFront, this.hintLayer, this.lift, this.streamLayer, this.capLayer);
    // Persistent Graphics for the per-frame layers (recreated in rebuild after the wipe)
    this.capLayer.addChild(this.capG);
    this.shadowLayer.addChild(this.shadowG);
    this.hintLayer.addChild(this.hintG);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    // drag-and-drop (taps are identified via !dragMoved in onPointerUp)
    this.app.stage.on('pointerdown', (e) => this.onPointerDown(e.global.x, e.global.y));
    this.app.stage.on('pointermove', (e) => this.onPointerMove(e.global.x, e.global.y));
    this.app.stage.on('pointerup', (e) => this.onPointerUp(e.global.x, e.global.y));
    this.app.stage.on('pointerupoutside', (e) => this.onPointerUp(e.global.x, e.global.y));
    this.app.stage.on('pointercancel', () => this.onPointerCancel());
    this.app.ticker.add(() => {
      this.time += this.app.ticker.deltaMS / 1000;
      this.frameCount++;

      // FPS-based quality detection (first 10 frames, if not already detected via hardware)
      if (!this.qualityDetected && this.frameCount <= 10) {
        this.frameTimeAccum += this.app.ticker.deltaMS;
        if (this.frameCount === 10) {
          const avgMs = this.frameTimeAccum / 10;
          if (avgMs > 25) { // average < 40fps → weak device
            this.qualityLevel = 'low';
            this.applyRendererResolution();
          }
          this.qualityDetected = true;
        }
      }

      this.syncPoses();
      // Shadows: every frame at high quality; every 2 frames at low quality.
      if (this.qualityLevel === 'high' || this.frameCount % 2 === 0) {
        this.drawShadows();
      }
      this.drawLiquidAll();
      this.drawCaps();
      this.drawHints();
    });
    // GSAP updates on the same tick as Pixi (priority HIGH=25 → runs before the ticker above),
    // eliminating the 1-frame lag between the GSAP animation and the PixiJS render.
    gsap.ticker.remove(gsap.updateRoot);
    this.app.ticker.add(() => gsap.updateRoot(performance.now() / 1000), undefined, 25);
  }

  /** State history for Undo — read-only copy. */
  get currentHistory(): GameState[] { return this.history.map(h => cloneState(h)); }

  /** Restores a saved session: visual of the current state + history + move count. */
  restoreSession(state: GameState, moves: number, optimalMoves: number, history: GameState[]): void {
    this.setLevel(state, optimalMoves);
    this.history = history.map(h => cloneState(h));
    this.moves = moves;
    this.fireChange();
  }

  /** Pauses the render loop (e.g. backgrounded tab). */
  pause(): void { if (this.app.ticker.started) this.app.ticker.stop(); }

  /** Resumes the render loop. */
  resume(): void { if (!this.app.ticker.started) this.app.ticker.start(); }

  /** Sets the level and computes the responsive layout from the current window size. */
  setLevel(state: GameState, optimalMoves = 0): void {
    // GC: kill animations from the previous level BEFORE swapping state — orphaned pour
    // timelines must not applyMove() onto the new level, and pose tweens must not keep
    // mutating old poses.
    for (const info of this.activePours.values()) info.tl.kill();
    this.activePours.clear();
    for (const p of this.poses) gsap.killTweensOf(p);
    for (const from of this.pourSources) {
      // return tubes that were in the lift to their normal layers (rebuild may not run)
      if (this.backG[from]) this.glassBack.addChild(this.backG[from]);
      if (this.liquidG[from]) this.liquid.addChild(this.liquidG[from]);
      if (this.hiddenC[from]) this.hiddenLayer.addChild(this.hiddenC[from]);
      if (this.frontG[from]) this.glassFront.addChild(this.frontG[from]);
    }
    this.pourSources.clear();
    for (const g of this.streamG.values()) { if (!g.destroyed) g.clear(); }

    this.floodEpoch++; // invalidate in-flight flood swaps — they must not apply onto the new level

    this.state = cloneState(state);
    this.optimalMoves = optimalMoves;
    this.renderTubes = state.tubes.map(() => null);
    this.fillCap = state.tubes.map(() => null);
    this.selected = null;
    this.busy.clear();
    this.history = [];
    this.helps = 0;
    this.hintFrom = null;
    this.hintTo = null;
    this.bossFloodCounter = 0;
    this.undoUsed = 0;
    this.hintUsed = 0;
    this.extraTubeUsed = 0;
    this.wildShownThisLevel = false;
    this.relayout(); // computes sizes and (re)builds the tubes in the right order
    this.checkFirstWild(); // fires the tutorial if the level already contains a WILD
  }

  enableBossMode(floodInterval: number, floodCount: number): void {
    this.bossActive = true;
    this.bossFloodInterval = floodInterval;
    this.bossFloodCounter = 0;
    this.bossFloodCount = Math.max(1, floodCount);
  }

  disableBossMode(): void {
    this.bossActive = false;
    this.bossFloodCounter = 0;
  }

  private tryFlood(): void {
    if (!this.bossActive || this.bossFloodInterval <= 0) return;
    this.bossFloodCounter++;
    if (this.bossFloodCounter < this.bossFloodInterval) return;
    this.bossFloodCounter = 0;

    this.runFloodSwaps(this.bossFloodCount);
  }

  /** Runs `remaining` flood swaps in sequence — each chosen after the previous one completes, so it reads the already-updated state. */
  private runFloodSwaps(remaining: number): void {
    if (remaining <= 0) return;
    // disableBossMode() in the middle of a chain (goMenu/skip) — the chain dies here, it does
    // not keep swapping units of a level that is no longer a boss level.
    if (!this.bossActive) return;
    const pair = this.pickFloodPair();
    if (!pair) return;
    this.animateFloodSwap(pair[0], pair[1], () => this.runFloodSwaps(remaining - 1));
  }

  /** Tubes participating in a player pour AT THIS moment (source, destination, or busy). */
  private tubesInActivePour(): Set<number> {
    const s = new Set<number>(this.busy);
    for (const i of this.pourSources) s.add(i);
    for (const [from, info] of this.activePours) { s.add(from); s.add(info.to); }
    return s;
  }

  /** Picks a pair of eligible tubes with different top colors, or null if there is no valid pair. */
  private pickFloodPair(): [number, number] | null {
    const locks = this.state.locks ?? [];
    // Concurrency: tubes in the MIDDLE of a player pour (source in the lift, destination
    // receiving, or any busy) must NOT enter the boss swap — their top is about to change.
    const inPour = this.tubesInActivePour();

    // Eligible: not complete, not locked, with at least 1 unit, not in an active pour
    const eligible: number[] = [];
    for (let i = 0; i < this.state.tubes.length; i++) {
      const tube = this.state.tubes[i];
      if (inPour.has(i)) continue;
      if ((locks[i] ?? 0) > 0) continue;
      if (tube.length === 0) continue;
      if (tube.length === this.state.capacity && tube.every(c => c === tube[0])) continue;
      eligible.push(i);
    }
    if (eligible.length < 2) return null;

    // Shuffle and look for a pair with different top colors
    const shuffled = eligible.slice().sort(() => Math.random() - 0.5);
    let idxA = -1, idxB = -1;
    outer: for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        const topA = this.state.tubes[shuffled[i]].at(-1);
        const topB = this.state.tubes[shuffled[j]].at(-1);
        if (topA !== undefined && topB !== undefined && topA !== topB) {
          idxA = shuffled[i]; idxB = shuffled[j]; break outer;
        }
      }
    }
    if (idxA === -1 || idxB === -1) return null;
    return [idxA, idxB];
  }

  /** Swaps the top units between two tubes — preserves the total count per color (the puzzle stays solvable). */
  private animateFloodSwap(tubeIdxA: number, tubeIdxB: number, onSwapDone?: () => void): void {
    const tubeA = this.state.tubes[tubeIdxA];
    const tubeB = this.state.tubes[tubeIdxB];
    const colorA = tubeA.at(-1)!;
    const colorB = tubeB.at(-1)!;
    const cA = this.centers[tubeIdxA];
    const cB = this.centers[tubeIdxB];
    if (!cA || !cB) return;

    const makeDrop = (color: number, sx: number, sy: number) => {
      const base = LIQUID_COLORS[color] ?? 0x888888;
      const r = Math.max(5, this.tubeW * 0.14);
      const g = new Graphics();
      g.circle(0, 0, r).fill({ color: base, alpha: 0.95 });
      g.circle(-r * 0.28, -r * 0.28, r * 0.36).fill({ color: 0xffffff, alpha: 0.3 });
      g.position.set(sx, sy);
      this.streamLayer.addChild(g);
      return g;
    };

    const startYOffset = -this.tubeH * 0.22;
    const gA = makeDrop(colorA, cA.x, cA.y + startYOffset);
    const gB = makeDrop(colorB, cB.x, cB.y + startYOffset);

    // Parametric arc: each drop traces a sin(π*t) curve on the Y axis while traversing the X axis.
    const arcH = this.tubeH * 0.85;
    const dur = 0.52;
    let done = 0;
    const epoch = this.floodEpoch; // capture the epoch — setLevel() midway invalidates this swap

    const onDone = () => {
      if (++done < 2) return;
      // EPOCH: restart/next level/new level during the drop's ~0.52s — the current state belongs
      // to a DIFFERENT level. Never apply the swap or continue the chain (even if the tops happen
      // to coincide with colorA/colorB of the previous level).
      if (epoch !== this.floodEpoch) return;
      // REVALIDATION (boss × player concurrency): between capturing colorA/colorB and this
      // onComplete (~0.52s), the player may have poured. If the top of either tube changed, or if
      // either entered an active pour (state not yet applied), silently ABORT the swap — never
      // replace the wrong unit (it would lose/duplicate a color and could make the level
      // unwinnable).
      const inPour = this.tubesInActivePour();
      const topA = this.state.tubes[tubeIdxA]?.at(-1);
      const topB = this.state.tubes[tubeIdxB]?.at(-1);
      if (topA !== colorA || topB !== colorB || inPour.has(tubeIdxA) || inPour.has(tubeIdxB)) {
        onSwapDone?.(); // continue the chain (runFloodSwaps) — the next link re-picks a valid pair
        return;
      }
      this.state = {
        ...this.state,
        tubes: this.state.tubes.map((t, i) => {
          if (i === tubeIdxA) return [...t.slice(0, -1), colorB];
          if (i === tubeIdxB) return [...t.slice(0, -1), colorA];
          return t;
        }),
      };
      this.onFlood?.(tubeIdxA, colorA);
      this.fireChange(); // recompute deadlock after the swap
      onSwapDone?.();
    };

    const objA = { t: 0 };
    const startAy = cA.y + startYOffset;
    const endAy   = cB.y + startYOffset;
    gsap.to(objA, {
      t: 1, duration: dur, ease: 'power1.inOut',
      onUpdate: () => {
        if (gA.destroyed) return; // rebuild (resize/theme) wiped the streamLayer mid-flight
        gA.x = cA.x + (cB.x - cA.x) * objA.t;
        gA.y = startAy + (endAy - startAy) * objA.t - arcH * Math.sin(Math.PI * objA.t);
      },
      onComplete: () => {
        if (!gA.destroyed) { this.streamLayer.removeChild(gA); gA.destroy(); }
        onDone();
      },
    });

    const objB = { t: 0 };
    const startBy = cB.y + startYOffset;
    const endBy   = cA.y + startYOffset;
    gsap.to(objB, {
      t: 1, duration: dur, ease: 'power1.inOut',
      onUpdate: () => {
        if (gB.destroyed) return; // rebuild (resize/theme) wiped the streamLayer mid-flight
        gB.x = cB.x + (cA.x - cB.x) * objB.t;
        gB.y = startBy + (endBy - startBy) * objB.t - arcH * 1.15 * Math.sin(Math.PI * objB.t);
      },
      onComplete: () => {
        if (!gB.destroyed) { this.streamLayer.removeChild(gB); gB.destroy(); }
        onDone();
      },
    });
  }

  /** Recomputes positions/size on resize (keeps state). */
  relayout(): void {
    const vw = window.innerWidth || 390;
    const vh = window.innerHeight || 844;
    // Measure the real DOM HUD so we never overlap buttons/text regardless of zoom or safe-area.
    const topEl = document.getElementById('hud-top');
    const botEl = document.getElementById('hud-bottom');
    // +28 ensures even the selected tube (raised by tubeH*0.08) does not reach the HUD text
    const hudTop = topEl ? topEl.getBoundingClientRect().bottom + 28 : undefined;
    const hudBot = botEl ? Math.max(100, vh - botEl.getBoundingClientRect().top + 16) : undefined;
    const { tubeW, tubeH, centers } = computeLayout(this.state.tubes.length, vw, vh, hudTop, hudBot);
    const sizeChanged = tubeW !== this.tubeW || tubeH !== this.tubeH;
    this.tubeW = tubeW;
    this.tubeH = tubeH;
    this.centers = centers;
    this.shape = buildTubeShape(tubeW, tubeH, this.shapeSpec);
    this.interiorLocal = this.shape.poly;
    this.outerLocal = bottlePoly(tubeW, tubeH, this.shapeSpec);
    if (sizeChanged || this.backG.length !== this.state.tubes.length) this.rebuild();
    // reposition rest poses (preserves selection/lift)
    for (let i = 0; i < this.poses.length; i++) {
      this.poses[i].cx = centers[i].x;
      this.poses[i].cy = centers[i].y - (this.selected === i ? tubeH * 0.08 : 0);
      this.poses[i].angle = 0;
    }
  }

  private rebuild(): void {
    // ---- GC/memory (Pixi v8): removeChildren() does NOT free GPU Graphics/geometry. ----
    // 1) Active pours: kill the timeline and APPLY the pending move (if the entry is still in
    //    activePours, the drain onComplete did not run) — the player does not lose the move on a resize.
    let appliedPending = false;
    for (const [from, info] of [...this.activePours]) {
      info.tl.kill();
      this.state = applyMove(this.state, from, info.to);
      this.renderTubes[from] = null;
      this.fillCap[from] = null;
      this.renderTubes[info.to] = null;
      this.fillCap[info.to] = null;
      this.busy.delete(from);
      this.busy.delete(info.to);
      this.pourSources.delete(from);
      this.moves++;
      appliedPending = true;
    }
    this.activePours.clear();
    // 2) Pose tweens (selection/snap/drag) on poses that are about to be discarded.
    for (const p of this.poses) gsap.killTweensOf(p);
    // 3) REAL destroy of each layer; killTweensOf first — gsap must not hold a destroyed target
    //    (cap particles, flood drops).
    const wipe = (layer: Container): void => {
      for (const ch of layer.removeChildren()) {
        gsap.killTweensOf(ch);
        ch.destroy({ children: true });
      }
    };
    wipe(this.glassBack);
    wipe(this.glassFront);
    wipe(this.liquid);
    wipe(this.lift);
    wipe(this.streamLayer);
    this.streamG.clear(); // the stream pool was destroyed together with the streamLayer
    wipe(this.capLayer);
    wipe(this.shadowLayer);
    wipe(this.hintLayer);
    // Persistent per-layer Graphics (1 per layer, clear() per frame) — recreated after the wipe.
    this.capG = new Graphics();
    this.capLayer.addChild(this.capG);
    this.shadowG = new Graphics();
    this.shadowLayer.addChild(this.shadowG);
    this.hintG = new Graphics();
    this.hintLayer.addChild(this.hintG);
    // Texts hold GPU resources in Pixi v8 — explicit destroy() (never just removeChildren).
    for (const hc of this.hiddenC) { if (!hc.destroyed) hc.destroy({ children: true }); }
    this.hiddenLayer.removeChildren();
    this.hiddenC = [];
    const fontSize = Math.max(10, Math.round(this.tubeW * 0.27));
    this.iconStyleQ = new TextStyle({ fontSize, fill: 0xffffff, fontWeight: 'bold', fontFamily: 'sans-serif' });
    // The wildcard (WILD_COLOR) is nearly white — a white ✦ with no outline disappears on it. A
    // thin dark stroke gives contrast on any background without changing the symbol color.
    this.iconStyleW = new TextStyle({
      fontSize: Math.round(fontSize * 0.82), fill: 0xffffff, fontWeight: 'bold', fontFamily: 'sans-serif',
      stroke: { color: 0x1a1a1a, width: Math.max(1.5, fontSize * 0.09) },
    });
    this.backG = [];
    this.frontG = [];
    this.liquidG = [];
    this.poses = [];
    for (let i = 0; i < this.state.tubes.length; i++) {
      const back = this.buildGlassBack();
      const front = this.buildGlassFront();
      const lg = new Graphics();
      const hc = new Container();
      this.glassBack.addChild(back);
      this.glassFront.addChild(front);
      this.liquid.addChild(lg);
      this.hiddenLayer.addChild(hc);
      this.backG.push(back);
      this.frontG.push(front);
      this.liquidG.push(lg);
      this.hiddenC.push(hc);
      const c = this.centers[i] ?? { x: 0, y: 0 };
      this.poses.push({ cx: c.x, cy: c.y, angle: 0 });
    }
    // If pending moves were applied (resize/theme change mid-pour), sync the HUD + saved
    // session — without this the counter and the autosave fall out of date.
    if (appliedPending) this.fireChange();
  }

  private syncPoses(): void {
    for (let i = 0; i < this.poses.length; i++) {
      const p = this.poses[i];
      const b = this.backG[i];
      const f = this.frontG[i];
      if (b) {
        b.position.set(p.cx, p.cy);
        b.rotation = p.angle;
      }
      if (f) {
        f.position.set(p.cx, p.cy);
        f.rotation = p.angle;
      }
    }
  }

  // ---- glass (LOCAL coords, centered; rotates with the tube) ----

  private buildGlassBack(): Container {
    const c = new Container();
    const g = new Graphics();
    // Translucent empty glass — a barely perceptible fill just to give a glass halo.
    g.poly(flat(this.outerLocal)).fill({ color: this.glassColor, alpha: 0.06 });
    c.addChild(g);
    return c;
  }

  private buildGlassFront(): Container {
    const c = new Container();
    const spec = this.shapeSpec;
    const nw = this.tubeW * spec.neckRatio;
    const nt = nw * 0.11;
    const top = -this.tubeH / 2;
    const shoulderTopY = top + this.tubeH * spec.shoulderTop;

    // Thinner, more transparent outline
    const g = new Graphics();
    g.poly(flat(this.outerLocal)).stroke({ color: this.glassColor, alpha: 0.52, width: Math.max(1.2, this.tubeW * 0.024) });

    // lip at the neck mouth
    const lip = new Graphics();
    lip
      .moveTo(-nw / 2, top + nt)
      .arcTo(-nw / 2, top, -nw / 2 + nt, top, nt)
      .lineTo(nw / 2 - nt, top)
      .arcTo(nw / 2, top, nw / 2, top + nt, nt)
      .stroke({ color: 0xffffff, alpha: 0.45, width: Math.max(1.5, nw * 0.08), cap: 'round' });

    // Left rim light — a second edge hugging the outline (neck→shoulder→body→bottom). Derived
    // from the actual silhouette profile, so it follows ANY equipped shape, not just the bottle.
    const ins = Math.max(1.2, this.tubeW * 0.022);   // inset ≈ wall thickness
    const rimW = Math.max(2.5, this.tubeW * 0.050); // left rim light
    const rpts = bottleProfileLeft(this.tubeW, this.tubeH, spec, ins);
    const rimLeft = new Graphics();
    rimLeft.moveTo(rpts[0].x, rpts[0].y);
    for (let i = 1; i < rpts.length; i++) rimLeft.lineTo(rpts[i].x, rpts[i].y);
    rimLeft.stroke({ color: this.glassColor, alpha: 0.22, width: rimW, cap: 'round' });

    // Two little light dots on the neck (condensation)
    const drops = new Graphics();
    drops.circle(-nw * 0.22, top + this.tubeH * 0.055, Math.max(1.0, nw * 0.065))
         .fill({ color: 0xffffff, alpha: 0.50 });
    drops.circle(-nw * 0.14, top + this.tubeH * 0.088, Math.max(0.7, nw * 0.042))
         .fill({ color: 0xffffff, alpha: 0.35 });

    // subtle highlight on the shoulder
    const shoulder = new Graphics();
    const shoulderY = shoulderTopY + (this.tubeH * (spec.shoulderBot - spec.shoulderTop)) * 0.25;
    shoulder
      .moveTo(-nw / 2, shoulderY)
      .lineTo(nw / 2, shoulderY)
      .stroke({ color: 0xffffff, alpha: 0.12, width: Math.max(1, this.tubeW * 0.06), cap: 'round' });

    c.addChild(g, lip, rimLeft, drops, shoulder);
    return c;
  }

  // ---- liquid (WORLD coords; surface always horizontal) ----

  private drawLiquidAll(): void {
    for (let i = 0; i < this.state.tubes.length; i++) this.drawLiquid(i);
  }

  /** Corners of the neck MOUTH (interior) in world space — used to compute the overflow lip. */
  private mouthWorld(pose: Pose): { l: V2; r: V2 } {
    const mx = this.shape.neckWi / 2 - this.shape.neckRt;
    const my = -this.shape.hInt / 2;
    return { l: toWorld({ x: -mx, y: my }, pose), r: toWorld({ x: mx, y: my }, pose) };
  }

  /** Y (world) of the overflow lip = LOWEST mouth corner (largest y). */
  private spillLipY(pose: Pose): number {
    const m = this.mouthWorld(pose);
    return Math.max(m.l.y, m.r.y);
  }

  private drawLiquid(i: number): void {
    const g = this.liquidG[i];
    g.clear();
    const tube = this.renderTubes[i] ?? this.state.tubes[i];
    if (!tube || tube.length === 0) { this.hideHiddenIcons(i); return; }

    const worldInterior = polyToWorld(this.interiorLocal, this.poses[i]);
    const unitVol = shoelace(worldInterior) / this.state.capacity;
    // headspace — the liquid never fills up to the lip, it leaves ~12% of air space at the top.
    const spillCap = submergedArea(worldInterior, this.spillLipY(this.poses[i])) * HEADSPACE_VOL_FRAC;
    const cap = this.fillCap[i];
    const capVol = cap == null ? spillCap : Math.min(cap * unitVol, spillCap);

    // Hidden bottom: replace hidden colors with the HIDDEN_UNIT sentinel for rendering
    const hiddenMap = this.state.hidden?.[i];
    const displayTube = hiddenMap ? tube.map((c, p) => (hiddenMap[p] ? HIDDEN_UNIT : c)) : tube;

    const { surfaceY, colors, bottomY } = computeBandLevels(worldInterior, this.state.capacity, displayTube, capVol);

    // Map bandIdx → number of units in the band (to compute per-unit positions)
    const bandUnitCounts: number[] = [];
    { let pos = 0;
      while (pos < displayTube.length) {
        const c = displayTube[pos]; let end = pos;
        while (end < displayTube.length && displayTube[end] === c) end++;
        bandUnitCounts.push(end - pos); pos = end;
      }
    }

    for (let b = 0; b < surfaceY.length; b++) {
      const topY = surfaceY[b];
      const botY = b === 0 ? bottomY + 2 : surfaceY[b - 1];
      if (botY - topY < 0.5) continue;
      let slab = clipH(worldInterior, topY, true);
      slab = clipH(slab, botY, false);
      if (slab.length < 3) continue;
      const base = colors[b] === WILD ? WILD_COLOR
                 : colors[b] === HIDDEN_UNIT ? HIDDEN_COLOR
                 : LIQUID_COLORS[colors[b]];
      g.poly(flat(slab)).fill({ color: base }); // solid color — flat (color-blindness accessibility)
      if (b === surfaceY.length - 1) this.drawSurface(g, worldInterior, topY, base);

      // Separator lines between hidden units
      if (colors[b] === HIDDEN_UNIT) {
        const numUnits = bandUnitCounts[b] ?? 1;
        const bandH = (b === 0 ? bottomY : surfaceY[b - 1]) - topY;
        const unitH = bandH / numUnits;
        const lineW = this.tubeW * 0.52;
        const cx = worldInterior.reduce((s, p) => s + p.x, 0) / worldInterior.length;
        for (let j = 1; j < numUnits; j++) {
          const sepY = (b === 0 ? bottomY : surfaceY[b - 1]) - j * unitH;
          g.moveTo(cx - lineW / 2, sepY).lineTo(cx + lineW / 2, sepY)
           .stroke({ width: 0.9, color: 0x4a5a8a, alpha: 0.55 });
        }
      }
    }

    // "?"/"✦" icons: repositioned with the SAME bands as this frame (unitVol/capVol) —
    // they follow selection, drag, tilt, and the pour's fill/drain animation.
    this.updateHiddenIcons(i, worldInterior, displayTube, unitVol, capVol);
  }

  /** Updates (per frame) the icons of tube i, one per hidden/WILD unit, centered on the
   *  unit's slice in WORLD coords (same reference as the liquid — does not rotate with the glass).
   *  Text pool in hiddenC[i]: create when missing, hide (visible=false) when in surplus —
   *  never creates/destroys a Text per frame. */
  private updateHiddenIcons(
    i: number, worldInterior: V2[], displayTube: number[], unitVol: number, capVol: number,
  ): void {
    const hc = this.hiddenC[i];
    if (!hc) return;
    let used = 0;
    let cx: number | null = null;
    for (let u = 0; u < displayTube.length; u++) {
      const c = displayTube[u];
      const isHidden = c === HIDDEN_UNIT;
      if (!isHidden && c !== WILD) continue;
      // Top/bottom of the slice of unit u, respecting the animation's volume ceiling (fillCap).
      const botY = waterline(worldInterior, Math.min(u * unitVol, capVol));
      const topY = waterline(worldInterior, Math.min((u + 1) * unitVol, capVol));
      if (botY - topY < 1) continue; // unit (almost) drained — no room for an icon
      cx ??= worldInterior.reduce((s, p) => s + p.x, 0) / worldInterior.length;
      const txt = this.obtainIconText(hc, used++);
      const label = isHidden ? '?' : '✦';
      if (txt.text !== label) {
        txt.text = label;
        txt.style = isHidden ? this.iconStyleQ : this.iconStyleW;
      }
      txt.alpha = isHidden ? 0.78 : 0.72;
      txt.visible = true;
      txt.position.set(cx, (topY + botY) / 2);
    }
    for (let k = used; k < hc.children.length; k++) hc.children[k].visible = false;
  }

  /** Gets the Text at index idx from the container's pool, creating it if needed. */
  private obtainIconText(hc: Container, idx: number): Text {
    if (idx < hc.children.length) return hc.children[idx] as Text;
    const t = new Text({ text: '?', style: this.iconStyleQ });
    t.anchor.set(0.5, 0.5);
    hc.addChild(t);
    return t;
  }

  private hideHiddenIcons(i: number): void {
    const hc = this.hiddenC[i];
    if (hc) for (const ch of hc.children) ch.visible = false;
  }

  private drawSurface(g: Graphics, worldInterior: V2[], topY: number, base: number): void {
    const xs: number[] = [];
    const n = worldInterior.length;
    for (let i = 0; i < n; i++) {
      const a = worldInterior[i];
      const b = worldInterior[(i + 1) % n];
      if (a.y === b.y) continue;
      const t = (topY - a.y) / (b.y - a.y);
      if (t >= 0 && t <= 1) xs.push(a.x + (b.x - a.x) * t);
    }
    if (xs.length < 2) return;
    xs.sort((p, q) => p - q);
    const xl = xs[0];
    const xr = xs[xs.length - 1];
    const w = xr - xl;
    if (w <= 1) return;
    // sheen band just below the surface (reads as liquid, not a flat bar) — skipped at low quality
    if (this.qualityLevel === 'high') {
      const sheen = clipH(clipH(worldInterior, topY, true), topY + Math.min(this.tubeH * 0.04, w * 0.22), false);
      if (sheen.length >= 3) g.poly(flat(sheen)).fill({ color: lighten(base, 0.34), alpha: 0.6 });
    }
    // light CONCAVE meniscus (edges higher than the center) — liquid surface
    const sag = Math.min(this.tubeH * 0.02, w * 0.08);
    g.moveTo(xl + w * 0.08, topY)
      .quadraticCurveTo((xl + xr) / 2, topY + sag, xr - w * 0.08, topY)
      .stroke({ color: lighten(base, 0.55), alpha: 0.7, width: Math.max(1.2, this.tubeW * 0.04), cap: 'round' });
  }

  // ---- interaction ----

  private isTubeComplete(i: number): boolean {
    const tube = this.state.tubes[i];
    return tube.length === this.state.capacity && tube.every((c) => c === tube[0]);
  }

  private onTap(x: number, y: number): void {
    const i = this.tubeAt(x, y);
    if (i == null) { this.deselect(); return; }

    // Pours arriving at i (as receiver)
    const inbound = [...this.activePours.entries()].filter(([, info]) => info.to === i);

    if (inbound.length > 0) {
      // double pour: is there a selected source with a compatible color?
      if (this.selected != null) {
        const from2 = this.selected;
        if (!this.busy.has(from2) && !this.isTubeComplete(from2) && canPour(this.state, from2, i)) {
          const activeColor = this.state.tubes[inbound[0][0]].at(-1);
          const newColor = this.state.tubes[from2].at(-1);
          if (newColor === activeColor) {
            this.deselect();
            void this.pour(from2, i, true);
            return;
          }
        }
      }
      // skip: no compatible source → skip all animations arriving at i
      for (const [from, info] of inbound) this.skipPour(from, info);
      return;
    }

    if (this.busy.has(i) || this.isTubeComplete(i)) return;

    if (this.selected == null) {
      if (this.state.tubes[i].length > 0) this.select(i);
    } else if (this.selected === i) {
      this.deselect();
    } else {
      const from = this.selected;
      this.deselect();
      void this.pour(from, i);
    }
  }

  // drag-and-drop --------------------------------------------------------

  private onPointerDown(x: number, y: number): void {
    const i = this.tubeAt(x, y);
    this.dragMoved = false;
    // busy or empty tubes only take part in the tap flow (onPointerUp → onTap)
    if (i == null || this.busy.has(i) || this.isTubeComplete(i) || this.state.tubes[i].length === 0) {
      this.dragTube = null;
      return;
    }
    this.dragTube = i;
    this.dragStartX = x;
    this.dragStartY = y;
    this.dragInLift = false;
  }

  private onPointerMove(x: number, y: number): void {
    if (this.dragTube == null) return;
    const i = this.dragTube;
    if (this.busy.has(i)) { // tube became busy mid-drag — return it to rest
      this.dragTube = null;
      if (this.dragInLift) {
        this.glassBack.addChild(this.backG[i]);
        this.liquid.addChild(this.liquidG[i]);
        this.hiddenLayer.addChild(this.hiddenC[i]);
        this.glassFront.addChild(this.frontG[i]);
        this.dragInLift = false;
        gsap.to(this.poses[i], {
          cx: this.centers[i].x, cy: this.centers[i].y, angle: 0,
          duration: 0.25, ease: 'back.out(1.5)',
        });
      }
      return;
    }
    const dist = Math.hypot(x - this.dragStartX, y - this.dragStartY);
    if (!this.dragMoved) {
      if (dist < this.DRAG_THRESHOLD) return;
      this.dragMoved = true;
      gsap.killTweensOf(this.poses[i]);
      if (this.selected === i) this.selected = null;
      else if (this.selected != null) this.deselect();
      // recompute the offset based on the current pose (it may be raised by the selection)
      this.dragOffX = x - this.poses[i].cx;
      this.dragOffY = y - this.poses[i].cy;
      this.lift.addChild(this.backG[i], this.liquidG[i], this.hiddenC[i], this.frontG[i]);
      this.dragInLift = true;
    }
    this.poses[i].cx = x - this.dragOffX;
    this.poses[i].cy = y - this.dragOffY;
    this.poses[i].angle = 0;
  }

  private onPointerUp(x: number, y: number): void {
    const from = this.dragTube;
    this.dragTube = null;
    if (!this.dragMoved) { this.onTap(x, y); return; }
    if (from == null) return;
    if (this.dragInLift) {
      this.glassBack.addChild(this.backG[from]);
      this.liquid.addChild(this.liquidG[from]);
      this.hiddenLayer.addChild(this.hiddenC[from]);
      this.glassFront.addChild(this.frontG[from]);
      this.dragInLift = false;
    }
    const to = this.tubeAt(x, y);
    if (to != null && to !== from && !this.busy.has(to) && canPour(this.state, from, to)) {
      void this.pour(from, to);
    } else {
      // snap back into place with a light spring
      gsap.to(this.poses[from], {
        cx: this.centers[from].x, cy: this.centers[from].y, angle: 0,
        duration: 0.25, ease: 'back.out(1.5)',
      });
    }
  }

  private onPointerCancel(): void {
    const from = this.dragTube;
    this.dragTube = null;
    if (!this.dragMoved || from == null) return;
    if (this.dragInLift) {
      this.glassBack.addChild(this.backG[from]);
      this.liquid.addChild(this.liquidG[from]);
      this.hiddenLayer.addChild(this.hiddenC[from]);
      this.glassFront.addChild(this.frontG[from]);
      this.dragInLift = false;
    }
    gsap.to(this.poses[from], {
      cx: this.centers[from].x, cy: this.centers[from].y, angle: 0,
      duration: 0.25, ease: 'back.out(1.5)',
    });
  }

  // ---------------------------------------------------------------------------

  /** Skips an in-progress animation, applying the final state immediately. */
  private skipPour(from: number, info: { tl: gsap.core.Timeline; to: number }): void {
    info.tl.kill();
    this.clearStream(from); // only the stream of THIS pour — does not clear other streams/drops
    // parity with the animated flow: a tube completed via skip also gets the cap pop/particles
    const completedBefore = new Set<number>(
      this.state.tubes.map((_, i) => i).filter(i => this.isTubeComplete(i)),
    );
    this.state = applyMove(this.state, from, info.to);
    this.renderTubes[from] = null;
    this.fillCap[from] = null;
    this.glassBack.addChild(this.backG[from]);
    this.liquid.addChild(this.liquidG[from]);
    this.hiddenLayer.addChild(this.hiddenC[from]);
    this.glassFront.addChild(this.frontG[from]);
    this.poses[from].cx = this.centers[from].x;
    this.poses[from].cy = this.centers[from].y;
    this.poses[from].angle = 0;
    this.pourSources.delete(from);
    this.busy.delete(from);
    this.activePours.delete(from);
    // Only clear `to` if no more pours are arriving
    const stillReceiving = [...this.activePours.values()].some(v => v.to === info.to);
    if (!stillReceiving) {
      this.renderTubes[info.to] = null;
      this.fillCap[info.to] = null;
      this.busy.delete(info.to);
    }
    this.moves++;
    this.checkNewlyCompleted(completedBefore);
    this.fireChange();
    this.checkFirstWild();
    this.tryFlood();
  }

  private tubeAt(x: number, y: number): number | null {
    for (let i = 0; i < this.centers.length; i++) {
      const c = this.centers[i];
      if (Math.abs(x - c.x) <= this.tubeW * 0.62 && Math.abs(y - c.y) <= this.tubeH * 0.55) return i;
    }
    return null;
  }

  private select(i: number): void {
    this.selected = i;
    gsap.to(this.poses[i], { cy: this.centers[i].y - this.tubeH * 0.08, duration: 0.16, ease: 'power2.out' });
  }

  private deselect(): void {
    const i = this.selected;
    this.selected = null;
    if (i != null && !this.busy.has(i)) {
      gsap.to(this.poses[i], { cy: this.centers[i].y, duration: 0.16, ease: 'power2.out' });
    }
  }

  /** Animated pour source→destination. allowBusyDest=true for a double pour. */
  async pour(from: number, to: number, allowBusyDest = false): Promise<boolean> {
    if (this.busy.has(from)) return false;
    if (!allowBusyDest && this.busy.has(to)) return false;

    // For a double pour: use the projected state of the destination (includes in-progress pours)
    const currentToTube = (allowBusyDest && this.renderTubes[to]) ? this.renderTubes[to]! : this.state.tubes[to];
    const projectedState: GameState = allowBusyDest
      ? { ...this.state, tubes: this.state.tubes.map((t, idx) => idx === to ? currentToTube : t) }
      : this.state;

    if (!canPour(projectedState, from, to)) {
      // invalid feedback: shake the source
      gsap.fromTo(
        this.poses[from],
        { cx: this.centers[from].x - 4 },
        { cx: this.centers[from].x, duration: 0.3, ease: 'elastic.out(1,0.3)' },
      );
      return false;
    }
    const k = pourAmount(projectedState, from, to);
    const color = this.state.tubes[from][this.state.tubes[from].length - 1];
    const origFrom = this.state.tubes[from].length;
    const origTo = currentToTube.length;
    const oldFrom = this.state.tubes[from].slice();
    // pre-compute a preview of the destination's final state (may include the first in-progress pour)
    const previewToTube = applyMove(projectedState, from, to).tubes[to];

    // Save a snapshot before committing the move (for undo) — with the IN-FLIGHT pours already
    // applied: without this, the snapshot of a 2nd simultaneous pour (double/chained) would be
    // identical to the 1st (the pre-both state), and a single undo would revert BOTH moves
    // (the next undo would become a no-op and waste a charge in limited-undo modes).
    let snap = this.state;
    for (const [f, info] of this.activePours) snap = applyMove(snap, f, info.to);
    this.history.push(cloneState(snap));
    this.hintFrom = null;
    this.hintTo = null;

    this.busy.add(from);
    if (!allowBusyDest) this.busy.add(to);
    this.pourSources.add(from);

    const unitVol = shoelace(this.interiorLocal) / this.state.capacity;
    const totalSrcVol = origFrom * unitVol;
    const retainVol = (origFrom - k) * unitVol; // what must REMAIN in the source
    // ---- AXIS FIXED AT THE CORNER ----
    // dir = the side the BODY rises toward (the source side). The corner (lip) sits at the
    // destination's mouth, CENTERED and slightly above; the rest of the cup rotates around it while pouring.
    const lipY = -this.tubeH / 2;
    const lipTargetX = this.centers[to].x; // centered with the destination tube
    const lipTargetY = this.centers[to].y - this.tubeH / 2 - this.tubeH * 0.12; // mouth slightly higher
    const angMag = this.pourAngleFor(retainVol);
    const vw = this.app.screen.width;
    // outer corner of the neck mouth — the visual pivot point during the pour
    const nwOuter = this.tubeW * this.shapeSpec.neckRatio;
    const ntOuter = nwOuter * 0.11;
    const halfNeckCorner = nwOuter / 2 - ntOuter;
    // the bottle body (nearly horizontal on strong pours) must not go off-screen:
    const bodyOnScreen = (d: number): boolean => {
      const a = angMag * d;
      const lx = d * halfNeckCorner;
      const pcx = lipTargetX - (lx * Math.cos(a) - lipY * Math.sin(a));
      const ext = Math.abs((this.tubeW / 2) * Math.cos(a)) + Math.abs((this.tubeH / 2) * Math.sin(a));
      return pcx - ext > 4 && pcx + ext < vw - 4;
    };
    // preference: the body rises toward the SOURCE side; flips to the other side if that goes off-screen.
    let dir = this.centers[from].x <= this.centers[to].x ? 1 : -1;
    if (!bodyOnScreen(dir) && bodyOnScreen(-dir)) dir = -dir;
    const angle = angMag * dir;
    const lipX = dir * halfNeckCorner; // outer corner of the neck mouth
    // cup center so the corner stays fixed at lipTarget, given the angle (rotates around the corner)
    const centerAt = (a: number): V2 => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      return { x: lipTargetX - (lipX * c - lipY * s), y: lipTargetY - (lipX * s + lipY * c) };
    };
    const seat = centerAt(0); // UPRIGHT, corner resting against the destination's mouth

    // the moving tube becomes an OPAQUE unit on top (no translucency over the others)
    this.lift.addChild(this.backG[from], this.liquidG[from], this.hiddenC[from], this.frontG[from]);

    // source drains via overflow (natural, only in PHASE B); destination reveals what overflowed.
    this.renderTubes[from] = oldFrom;
    this.fillCap[from] = null;
    this.renderTubes[to] = previewToTube;
    if (!allowBusyDest) this.fillCap[to] = origTo;

    const pose = this.poses[from];
    let maxSpilled = 0;
    let appliedSpill = 0; // portion of maxSpilled ALREADY added to the destination's fillCap (additive)
    // capture the destination's current fill BEFORE the flow starts (supports double pour)
    let baselineFill = this.fillCap[to] ?? origTo;
    // Base speeds — tuned so a full pour reads at ~0.5-0.7s start to finish, even between distant
    // tubes or in quick sequence. Travel is fast with a safety ceiling for very distant tube
    // pairs; the pour-phase floor exists only to keep k=1 from feeling instantaneous, since the
    // per-unit scaling already covers larger pours. The return is fast too — the tube snaps back
    // almost as quickly as it went.
    const TRANSLATE_SPEED = 2200;  // px/s — outbound translation
    const APPROACH_ROT    = 7.0;   // rad/s — tilt during travel
    const RETURN_SPEED    = 1900;  // px/s — return
    const RETURN_ROT      = 8.5;   // rad/s — un-tilt on return
    // Time per poured unit (k), from the overflow point: gives time to SEE and HEAR each unit
    // draining, without dragging. Scales the "pour phase" proportionally to k — two units, two
    // beats; three units, three beats. With the continuous rotation (see PHASE B) the whole time
    // is visible motion, so this is kept short to avoid large pours (k=4) feeling sluggish.
    const PER_UNIT_POUR_TIME = 0.16; // s per unit

    const distA = Math.hypot(seat.x - pose.cx, seat.y - pose.cy);

    // ── POUR KINEMATICS ──────────────────────────────────────────────────
    // Why a "physically pure" version reads as stuck, in numbers: the geometric overflow arc
    // (threshold→final angle) on low-volume pours is TINY — measured in game: 0.08–0.22 rad
    // (5–12°). Spreading 12° over 0.5s gives ~20°/s of rotation: imperceptible, and the eye reads
    // it as "stuck" even while the liquid moves. So instead we rotate the tube through a large
    // constant ARC over the entire pour, with the liquid transferring at a constant rate — the
    // rigid coupling to geometry is dropped DURING the flow (the liquid render still clamps at the
    // lip, so nothing visually "leaks" before its time).
    //
    // Model:
    //   dock  = arrival angle, chosen to leave a rotation arc ≥ ~0.45 rad (26°) during the pour
    //           phase — ALWAYS visible, regardless of volume;
    //   PHASE B = ONE continuous sweep dock→final angle over durPour (scales with k), with the
    //           volume transferring LINEARLY in time (constant flow = constant sound);
    //   Sound = fires on PHASE B onStart and lasts exactly durPour (the SFX are trimmed — zero
    //           opening silence — so ear and eye receive the flow at the same instant).
    const spillThreshold = this.spillThresholdAngle(totalSrcVol);
    // Anchoring: ceiling 0.98*threshold (arrival never "shows" liquid above the lip), floor 0.12
    // (arrives visibly tilting), and at least 0.45 rad of arc reserved for the pour.
    const dockMag   = Math.min(0.98 * Math.min(spillThreshold, angMag), Math.max(0.12, angMag - 0.45));
    const dockAngle = dockMag * dir;
    const durT      = distA / TRANSLATE_SPEED;
    // Travel (PHASE A) at CONSTANT speed (linear ease) — duration based on distance/angle, with a
    // safety ceiling (0.22s) so very distant tube pairs do not become slow.
    const durTravel = Math.min(0.22, Math.max(0.10, Math.max(durT, dockMag / APPROACH_ROT)));
    // Pour phase: scales with k (two units, two beats). Floor of 0.24s so k=1 does not look
    // instantaneous.
    const durPour   = Math.max(0.24, PER_UNIT_POUR_TIME * k);

    // Return: un-tilt + retreat in parallel (same logic). The tube snaps back almost as quickly
    // as it went.
    const distHome  = Math.hypot(this.centers[from].x - seat.x, this.centers[from].y - seat.y);
    const durReturn = Math.min(0.26, Math.max(0.08, Math.max(distHome / RETURN_SPEED, Math.abs(angle) / RETURN_ROT)));

    // initial tube position (captured before the timeline starts)
    const initX = pose.cx;
    const initY = pose.cy;

    const tl = gsap.timeline();
    this.activePours.set(from, { tl, to, k });

    // PHASE A (travel): translation + tilt up to the ANCHOR angle (dock) — the liquid never
    // appears above the lip on the way (dock ≤ 0.98*threshold; the render clamps at the lip).
    // CONSTANT speed (linear ease/'none') so the motion happens at a single, steady velocity.
    const progAB = { t: 0 };
    tl.to(progAB, {
      t: 1,
      duration: durTravel,
      ease: 'none',
      onUpdate: () => {
        const t = progAB.t;
        const bx = initX + (seat.x - initX) * t;
        const by = initY + (seat.y - initY) * t;
        const curAngle = dockAngle * t; // partial tilt — never shows liquid at the lip
        const rp = centerAt(curAngle);
        pose.cx = bx + (rp.x - seat.x);
        pose.cy = by + (rp.y - seat.y);
        pose.angle = curAngle;
      },
    });

    // Capture which tubes were already complete BEFORE the pour (to detect newly complete ones after)
    const completedBefore = new Set<number>(
      this.state.tubes.map((_, i) => i).filter(i => this.isTubeComplete(i))
    );

    // PHASE B (pour — single sweep): the tube rotates from dock to the final angle over the WHOLE
    // durPour (arc ≥ ~0.45 rad = ALWAYS visible), while the VOLUME transfers linearly in time
    // (constant flow). Sound fires on onStart and lasts exactly the flow — with the trimmed SFX,
    // ear and eye receive the pour at the same instant.
    // The tube never sits still: it finishes rotating and the return starts on the next frame.
    const flow = { p: 0 };
    tl.to(flow, {
      p: 1,
      duration: durPour,
      ease: 'none',
      onStart: () => { this.onPour?.(durPour + 0.1); }, // +0.1 = natural fade tail of the SFX
      onUpdate: () => {
        const p = flow.p;
        // rotation: linear sweep across the full arc (dock → final angle)
        const curAngle = dockAngle + (angle - dockAngle) * p;
        const rp = centerAt(curAngle);
        pose.cx = rp.x;
        pose.cy = rp.y;
        pose.angle = curAngle;
        // volume: LINEAR transfer in time (constant flow)
        const v = k * p;
        if (v > maxSpilled) maxSpilled = v;
        this.fillCap[from] = origFrom - maxSpilled;
        // ADDITIVE by delta: each pour adds to the destination only what IT transferred since the
        // last frame — never decreases, and two simultaneous flows (double pour) accumulate a+b.
        // (Math.max of ABSOLUTE targets undercounted: the level showed max(a,b), froze during the
        // 2nd flow, and jumped by up to min(k1,k2) units when the fillCap was cleared at the end.)
        const dv = maxSpilled - appliedSpill;
        if (dv > 0) {
          this.fillCap[to] = (this.fillCap[to] ?? baselineFill) + dv;
          appliedSpill = maxSpilled;
        }
        if (maxSpilled > 0.02 && maxSpilled < k - 0.02) this.drawStream(from, to, color);
        else this.clearStream(from);
      },
      onComplete: () => {
        // state updated exactly when the liquid finishes (the tube starts the return)
        this.clearStream(from);
        this.fillCap[from] = origFrom - k;
        this.fillCap[to] = (this.fillCap[to] ?? baselineFill) + (k - appliedSpill);
        appliedSpill = k;
        this.state = applyMove(this.state, from, to);
        this.renderTubes[from] = null;
        this.fillCap[from] = null;
        this.activePours.delete(from);
        const stillReceiving = [...this.activePours.values()].some(v => v.to === to);
        if (!stillReceiving) {
          this.renderTubes[to] = null;
          this.fillCap[to] = null;
        }
      },
    });
    // Phase C (return): SEQUENTIAL — starts on the frame after the rotation ends (no pause).
    const retState = { x: 0, y: 0, a: 0 };
    const progC = { t: 0 };
    tl.to(progC, {
      t: 1,
      duration: durReturn,
      ease: 'power2.out',
      onStart: () => {
        retState.x = pose.cx;
        retState.y = pose.cy;
        retState.a = pose.angle;
      },
      onUpdate: () => {
        const t = progC.t;
        pose.cx = retState.x + (this.centers[from].x - retState.x) * t;
        pose.cy = retState.y + (this.centers[from].y - retState.y) * t;
        pose.angle = retState.a * (1 - t);
      },
    }); // gsap's default sequential placement — waits for the previous tween to finish
    tl.add(() => {
      this.glassBack.addChild(this.backG[from]);
      this.liquid.addChild(this.liquidG[from]);
      this.hiddenLayer.addChild(this.hiddenC[from]);
      this.glassFront.addChild(this.frontG[from]);
      this.pourSources.delete(from);
      this.busy.delete(from);
      const stillReceiving = [...this.activePours.values()].some(v => v.to === to);
      if (!stillReceiving) this.busy.delete(to);
      this.moves++;
      this.checkNewlyCompleted(completedBefore);
      this.fireChange();
      this.checkFirstWild();
      this.tryFlood();
    });
    await tl.then();
    return true;
  }

  /** Smallest angle (rad, ≥0) whose overflow leaves the source retaining ~`retainVol` of area. */
  private pourAngleFor(retainVol: number): number {
    let lo = 0;
    let hi = 2.7; // ~155°
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      const pose = { cx: 0, cy: 0, angle: mid };
      const wp = polyToWorld(this.interiorLocal, pose);
      const retainAt = submergedArea(wp, this.spillLipY(pose)); // decreases with the angle
      if (retainAt > retainVol) lo = mid;
      else hi = mid;
    }
    // floor so it stays visible; CEILING ~100° so the body does not go off-screen on draining pours.
    return Math.min(1.75, Math.max(0.5, (lo + hi) / 2));
  }

  /** Angle (rad) at which overflow BEGINS for a volume `vol`: the largest angle whose area
   *  submerged below the lip still holds `vol`. NO clamps — used to compute the safe travel
   *  angle (pour phase A), which sits 10% below this threshold. */
  private spillThresholdAngle(vol: number): number {
    let lo = 0;
    let hi = 2.7;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      const pose = { cx: 0, cy: 0, angle: mid };
      const wp = polyToWorld(this.interiorLocal, pose);
      if (submergedArea(wp, this.spillLipY(pose)) > vol) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }


  /** Pooled Graphics for the stream of the pour from source `from` (created 1× per tube; clear() per frame). */
  private getStreamG(from: number): Graphics {
    let g = this.streamG.get(from);
    if (!g || g.destroyed) {
      g = new Graphics();
      this.streamG.set(from, g);
    }
    if (!g.parent) this.streamLayer.addChild(g);
    return g;
  }

  /** Clears the stream of pour `from` without destroying the pooled Graphics. */
  private clearStream(from: number): void {
    const g = this.streamG.get(from);
    if (g && !g.destroyed) g.clear();
  }

  /** Stream + particles from the source's lip to the destination's surface.
   *  Runs PER FRAME during the flow — draws into the pour's POOLED Graphics (zero allocation/frame). */
  private drawStream(from: number, to: number, color: number): void {
    const dir = this.centers[to].x >= this.centers[from].x ? 1 : -1;
    const p = this.poses[from];
    const nwOuter = this.tubeW * this.shapeSpec.neckRatio;
    const lip = toWorld({ x: dir * (nwOuter / 2 - nwOuter * 0.11), y: -this.tubeH / 2 }, p);
    // target = current liquid SURFACE at the destination (bottom if empty; rises as it fills).
    const destInterior = polyToWorld(this.interiorLocal, this.poses[to]);
    const unitVol = shoelace(this.interiorLocal) / this.state.capacity;
    const shownUnits = this.fillCap[to] ?? (this.renderTubes[to] ?? this.state.tubes[to]).length;
    const surfY = waterline(destInterior, Math.max(0, shownUnits) * unitVol);
    const target: V2 = { x: this.centers[to].x, y: surfY };
    const base = color === WILD ? WILD_COLOR : LIQUID_COLORS[color];

    const g = this.getStreamG(from);
    g.clear();
    // stream: curve from the lip to the destination, tapering
    const midX = (lip.x + target.x) / 2;
    const ctrlY = Math.min(lip.y, target.y) - this.tubeH * 0.04;
    g.moveTo(lip.x, lip.y)
      .quadraticCurveTo(midX, ctrlY, target.x, target.y)
      .stroke({ color: base, alpha: 0.9, width: Math.max(2, this.tubeW * 0.12), cap: 'round' });
    g.moveTo(lip.x, lip.y)
      .quadraticCurveTo(midX, ctrlY, target.x, target.y)
      .stroke({ color: lighten(base, 0.4), alpha: 0.7, width: Math.max(1, this.tubeW * 0.05), cap: 'round' });
    // particles/splash at the impact point
    for (let n = 0; n < 5; n++) {
      const a = (n / 5) * Math.PI * 2 + this.time * 6;
      const rad = this.tubeW * (0.12 + 0.1 * ((n * 7 + Math.floor(this.time * 30)) % 5) / 5);
      g.circle(target.x + Math.cos(a) * rad, target.y + Math.abs(Math.sin(a)) * rad * 0.6, Math.max(1.2, this.tubeW * 0.03)).fill({
        color: lighten(base, 0.2),
        alpha: 0.8,
      });
    }
  }

  /** Golden cap when the tube is complete; cork when locked; colored dot on filtered tubes.
   *  Runs PER FRAME — draws everything into the persistent capG Graphics (clear(), never allocates/destroys).
   *  Bonus: with no removeChildren() on the capLayer, the spawnCapParticles particles survive the animation. */
  private drawCaps(): void {
    const g = this.capG;
    g.clear();
    for (let i = 0; i < this.state.tubes.length; i++) {
      if (this.busy.has(i)) continue;

      const pose = this.poses[i];
      const nw = this.tubeW * this.shapeSpec.neckRatio;

      // Filter indicator: colored dot floating above the neck
      const filterColor = this.state.filters?.[i];
      if (filterColor != null) {
        const lip = toWorld({ x: 0, y: -this.tubeH / 2 }, pose);
        const dotR = Math.max(3.5, this.tubeW * 0.065);
        g.circle(lip.x, lip.y - dotR * 2.2, dotR)
          .fill({ color: LIQUID_COLORS[filterColor] })
          .stroke({ color: 0xffffff, alpha: 0.4, width: Math.max(1, dotR * 0.25) });
      }

      // Cork stopper: locked tube (the lock has not dissolved yet)
      const lockVal = this.state.locks?.[i] ?? 0;
      if (lockVal > 0) {
        const capW = nw * 1.18;
        const capH = Math.max(8, this.tubeW * 0.135);
        const lip = toWorld({ x: 0, y: -this.tubeH / 2 }, pose);
        const cx = lip.x;
        const cy = lip.y - capH * 0.25;
        // stopper body — cork
        g.roundRect(cx - capW / 2, cy - capH / 2, capW, capH, Math.min(capH * 0.45, capW * 0.18))
          .fill({ color: 0xb8945f });
        // light inner reflection
        g.roundRect(cx - capW * 0.27, cy - capH * 0.22, capW * 0.54, capH * 0.44, capH * 0.2)
          .fill({ color: 0xd4a96a, alpha: 0.55 });
        continue;
      }

      // Golden cap: complete tube (full + single color)
      const tube = this.state.tubes[i];
      if (tube.length !== this.state.capacity || !tube.every((c) => c === tube[0])) continue;

      const capW = nw * 1.24;
      const capH = Math.max(7, this.tubeW * 0.115);
      const lip = toWorld({ x: 0, y: -this.tubeH / 2 }, pose);
      const cx = lip.x;
      const cy = lip.y - capH * 0.28;

      g.roundRect(cx - capW / 2, cy - capH / 2, capW, capH, Math.min(capH / 2, capW * 0.18))
        .fill({ color: GOLD });
    }
  }

  // ---- undo / hint / +tube -----------------------------------------------

  private checkNewlyCompleted(completedBefore: Set<number>): void {
    for (let i = 0; i < this.state.tubes.length; i++) {
      if (this.isTubeComplete(i) && !completedBefore.has(i)) {
        const color = this.state.tubes[i][0];
        this.onTubeComplete?.(i, color);
        this.spawnCapParticles(i, color);
      }
    }
  }

  private spawnCapParticles(tubeIdx: number, color: number): void {
    const base = LIQUID_COLORS[color] ?? 0x888888;
    const center = this.centers[tubeIdx];
    if (!center) return;
    const capY = center.y - this.tubeH / 2 - this.tubeH * 0.04;
    const count = this.qualityLevel === 'low' ? 5 : 14;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = this.tubeW * (0.9 + Math.random() * 1.2);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - this.tubeH * 0.6; // upward bias

      const g = new Graphics();
      const r = Math.max(2, this.tubeW * 0.06 + Math.random() * this.tubeW * 0.04);
      g.circle(0, 0, r).fill({ color: base, alpha: 0.9 });
      g.position.set(center.x, capY);
      this.capLayer.addChild(g);

      gsap.to(g, {
        x: center.x + vx * 0.28,
        y: capY + vy * 0.28,
        alpha: 0,
        duration: 0.55 + Math.random() * 0.25,
        ease: 'power2.out',
        onComplete: () => { this.capLayer.removeChild(g); g.destroy(); },
      });
    }

    // White flash on the cap (visual confirmation)
    const flash = new Graphics();
    const nw = this.tubeW * 0.6;
    flash.roundRect(-nw / 2, capY - 6, nw, 10, 4).fill({ color: 0xffffff, alpha: 0.9 });
    this.capLayer.addChild(flash);
    // Pixi has no flat "scaleX" (it is scale.x) — without PixiPlugin, gsap only warned and the
    // flash never stretched. Animate a proxy and apply it with a destroy guard.
    const fp = { t: 0 };
    gsap.to(fp, { t: 1, duration: 0.35, ease: 'power2.out',
      onUpdate: () => {
        if (flash.destroyed) return;
        flash.alpha = 0.9 * (1 - fp.t);
        flash.scale.x = 1 + 0.5 * fp.t;
      },
      onComplete: () => {
        if (!flash.destroyed) { this.capLayer.removeChild(flash); flash.destroy(); }
      } });
  }

  /** Undoes the last move. Returns false if there is no history or an animation is active. */
  undo(): boolean {
    if (this.history.length === 0 || this.busy.size > 0) return false;
    if (this.maxUndos >= 0 && this.undoUsed >= this.maxUndos) return false;
    this.undoUsed++;
    this.helps++;
    const prev = this.history.pop()!;
    this.state = prev;
    this.renderTubes = prev.tubes.map(() => null);
    this.fillCap = prev.tubes.map(() => null);
    this.selected = null;
    this.hintFrom = null;
    this.hintTo = null;
    // If the number of tubes changed (e.g. after +Tube), rebuild
    if (prev.tubes.length !== this.backG.length) this.relayout();
    this.moves = Math.max(0, this.moves - 1);
    this.fireChange(false);
    return true;
  }

  /** Highlights the next best move. Returns false if there is no solution or the limit is reached. */
  async showHint(): Promise<boolean> {
    if (this.maxHints >= 0 && this.hintUsed >= this.maxHints) return false;
    this.hintFrom = null;
    this.hintTo = null;
    const movesAtRequest = this.moves;
    const mv = await solverClient.nextHint(this.state);
    if (!mv) return false;
    // The board changed while the worker was computing (player moved, or the boss swapped tubes) —
    // the hint is for a state that no longer exists. Discard it instead of pointing at a wrong pair.
    if (this.moves !== movesAtRequest) return false;
    this.hintUsed++;
    this.helps++;
    this.hintFrom = mv.from;
    this.hintTo = mv.to;
    this.fireChange();
    return true;
  }

  /** Clears the hint highlight. */
  clearHint(): void {
    this.hintFrom = null;
    this.hintTo = null;
  }

  /** Adds an empty tube (reverted with undo). Blocked during animations or when the limit is reached. */
  addEmptyTube(): boolean {
    if (this.busy.size > 0) return false;
    if (this.maxExtraTubes >= 0 && this.extraTubeUsed >= this.maxExtraTubes) return false;
    this.extraTubeUsed++;
    this.helps++;
    this.history.push(cloneState(this.state));
    this.state = { ...this.state, tubes: [...this.state.tubes, []] };
    this.renderTubes = this.state.tubes.map(() => null);
    this.fillCap = this.state.tubes.map(() => null);
    this.hintFrom = null;
    this.hintTo = null;
    this.relayout();
    this.fireChange(false);
    return true;
  }

  /** Pulsing highlight on the hint tubes (source = yellow, destination = cyan).
   *  Also draws a soft aura around the selected tube (simulates blur via concentric halos). */
  private drawHints(): void {
    const g = this.hintG; // per FRAME — persistent Graphics, clear() (zero allocation)
    g.clear();

    // Selection aura — subtle glow around the selected tube
    if (this.selected != null && !this.busy.has(this.selected) && !this.dragMoved) {
      const i = this.selected;
      const pose = this.poses[i];
      const pts = polyToWorld(this.outerLocal, pose);
      const cx = pose.cx;
      const cy = pose.cy;
      // 4 growing concentric halos — simulates "blur" without an extra filter
      const halos: Array<{ sc: number; alpha: number }> = [
        { sc: 1.03, alpha: 0.18 },
        { sc: 1.07, alpha: 0.11 },
        { sc: 1.13, alpha: 0.06 },
        { sc: 1.20, alpha: 0.03 },
      ];
      for (const { sc, alpha } of halos) {
        const scaledPts = pts.map((p) => ({ x: cx + (p.x - cx) * sc, y: cy + (p.y - cy) * sc }));
        g.poly(flat(scaledPts)).stroke({
          color: 0xa5d8ff,
          alpha,
          width: Math.max(2.5, this.tubeW * 0.055),
        });
      }
    }

    if (this.hintFrom == null && this.hintTo == null) return;
    const pulse = 0.45 + 0.45 * Math.sin(this.time * 4.5);
    // 4 growing concentric halos — same "blur" treatment as the selection aura,
    // modulated by the pulse and in the hint colors (gold = source, teal = destination)
    const hintHalos: Array<{ sc: number; alpha: number }> = [
      { sc: 1.00, alpha: 0.88 },
      { sc: 1.05, alpha: 0.42 },
      { sc: 1.11, alpha: 0.22 },
      { sc: 1.18, alpha: 0.10 },
    ];
    for (const [idx, isSource] of [[this.hintFrom, true], [this.hintTo, false]] as [number | null, boolean][]) {
      if (idx == null) continue;
      // Selection always wins — avoids drawing both halos (selection blue + pulsing hint)
      // overlapping on the same tube when the player selects the source/destination tube
      // suggested by the hint. Parity with the same rule in drawShadows().
      if (idx === this.selected && !this.busy.has(idx) && !this.dragMoved) continue;
      const pose = this.poses[idx];
      if (!pose) continue;
      const pts = polyToWorld(this.outerLocal, pose);
      const cx = pose.cx;
      const cy = pose.cy;
      const color = isSource ? 0xffd700 : 0x5ad1c4;
      for (const { sc, alpha } of hintHalos) {
        const scaledPts = pts.map((p) => ({ x: cx + (p.x - cx) * sc, y: cy + (p.y - cy) * sc }));
        g.poly(flat(scaledPts)).stroke({
          color,
          alpha: pulse * alpha,
          width: Math.max(2.5, this.tubeW * 0.055),
        });
      }
    }
  }

  /** Grounding glow — a dark background hides a black shadow, so we use a colored glow
   *  (light the liquid reflects onto the surface below). Standard technique in dark-background games.
   *  The selected tube gets a 2× stronger and larger glow to emphasize the selection. */
  private drawShadows(): void {
    const g = this.shadowG; // per FRAME — persistent Graphics, clear() (zero allocation)
    g.clear();
    const pulse = 0.45 + 0.45 * Math.sin(this.time * 4.5);
    for (let i = 0; i < this.centers.length; i++) {
      if (this.pourSources.has(i)) continue; // source in a pour: it is in the lift, shadow disappears
      const isSelected = this.selected === i && !this.dragMoved;
      // Selection always wins — we do not even check hint in that case.
      const isHint = !isSelected && (i === this.hintFrom || i === this.hintTo);
      const c = this.centers[i];
      const cy = c.y + this.tubeH * 0.51;
      const tube = this.state.tubes[i];
      // Glow color: the liquid color at the bottom of the tube; GLASS if empty
      const glowColor = tube.length > 0 ? (LIQUID_COLORS[tube[0]] ?? this.glassColor) : this.glassColor;
      if (isSelected) {
        // Selection: much stronger and larger glow — "glowing floor" under the raised tube
        for (let r = 5; r >= 0; r--) {
          const sc = 1 + r * 0.30;
          const alpha = 0.52 - r * 0.08;
          if (alpha <= 0) continue;
          g.ellipse(c.x, cy, this.tubeW * 0.52 * sc, this.tubeH * 0.030 * sc).fill({ color: glowColor, alpha });
        }
      } else if (isHint) {
        // Hint: pulsing glow synced with the tube's halo — intermediate between idle and
        // selection (more rings/reach than idle, but never as strong/large as selected).
        // Color matches the halo: gold for source, teal for destination.
        const hintColor = i === this.hintFrom ? 0xffd700 : 0x5ad1c4;
        const baseAlpha = 0.15 + 0.30 * pulse; // pulses between ~0.15 and ~0.45
        for (let r = 4; r >= 0; r--) {
          const sc = 1 + r * 0.20; // up to ~1.8x
          const alpha = baseAlpha - r * 0.06;
          if (alpha <= 0) continue;
          g.ellipse(c.x, cy, this.tubeW * 0.44 * sc, this.tubeH * 0.026 * sc).fill({ color: hintColor, alpha });
        }
      } else {
        for (let r = 4; r >= 0; r--) {
          const sc = 1 + r * 0.24;
          const alpha = 0.22 - r * 0.04;
          if (alpha <= 0) continue;
          g.ellipse(c.x, cy, this.tubeW * 0.38 * sc, this.tubeH * 0.022 * sc).fill({ color: glowColor, alpha });
        }
      }
    }
  }

  /** Detects a deadlock: game not won AND no valid pour available. */
  private isDeadlocked(): boolean {
    if (isWin(this.state)) return false;
    const n = this.state.tubes.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && canPour(this.state, i, j)) return false;
      }
    }
    return true;
  }

  private fireChange(wonOverride?: boolean): void {
    const won = wonOverride ?? isWin(this.state);
    const canUndo = this.history.length > 0
      && (this.maxUndos < 0 || this.undoUsed < this.maxUndos);
    this.onChange?.({
      moves: this.moves,
      won,
      canUndo,
      deadlocked: !won && this.isDeadlocked(),
      undosLeft: this.maxUndos < 0 ? -1 : Math.max(0, this.maxUndos - this.undoUsed),
      hintsLeft:  this.maxHints < 0 ? -1 : Math.max(0, this.maxHints - this.hintUsed),
      tubesLeft:  this.maxExtraTubes < 0 ? -1 : Math.max(0, this.maxExtraTubes - this.extraTubeUsed),
    });
  }

  /** Checks whether the current state contains visible WILD units and, if it is the first time in
   *  the level, fires onFirstWild to show the tutorial. */
  private checkFirstWild(): void {
    if (this.wildShownThisLevel) return;
    const hasWild = this.state.tubes.some(tube => tube.includes(WILD));
    if (!hasWild) return;
    this.wildShownThisLevel = true;
    // Small delay to let the render settle before the toast appears
    setTimeout(() => { this.onFirstWild?.(); }, 600);
  }

  /** Configures power-up limits for the game mode. */
  setPowerUpLimits(undos: number, hints: number, tubes: number): void {
    this.maxUndos = undos;
    this.maxHints = hints;
    this.maxExtraTubes = tubes;
    this.undoUsed = 0;
    this.hintUsed = 0;
    this.extraTubeUsed = 0;
  }

  /** Applies the visual theme: app background color + tube glass color. */
  setTheme(bgDeep: number, tubeRim: number): void {
    this.app.renderer.background.color = bgDeep;
    this.glassColor = tubeRim;
    this.rebuild();
  }

  /** Applies the equipped tube SILHOUETTE (shop cosmetic). Recomputes the shape-derived
   *  geometry at the current size and rebuilds the glass — the liquid mechanic is unaffected
   *  (it levels by area over whatever interior polygon this produces). */
  setTubeShape(spec: TubeShapeSpec): void {
    this.shapeSpec = spec;
    if (this.tubeW > 0) {
      this.shape = buildTubeShape(this.tubeW, this.tubeH, spec);
      this.interiorLocal = this.shape.poly;
      this.outerLocal = bottlePoly(this.tubeW, this.tubeH, spec);
      this.rebuild();
    }
  }

  /** Manual override of graphics quality. 'auto' re-enables automatic detection. */
  setPerfMode(mode: 'auto' | 'low' | 'high'): void {
    if (mode === 'auto') {
      // Re-detect: reset the FPS counters
      this.qualityDetected = false;
      this.frameCount = 0;
      this.frameTimeAccum = 0;
      // Use the hardware heuristic immediately as a starting point
      const weakHW = (navigator.hardwareConcurrency ?? 4) < 4;
      this.qualityLevel = weakHW ? 'low' : 'high';
    } else {
      this.qualityLevel = mode;
      this.qualityDetected = true;
    }
    this.applyRendererResolution();
  }

  /**
   * Adjusts the WebGL renderer resolution at runtime based on this.qualityLevel.
   * antialias cannot be swapped without recreating the WebGL context (fixed in app.init),
   * but resolution can — and it is the biggest fill/blend cost factor on weak GPUs.
   */
  private applyRendererResolution(): void {
    const renderer = this.app.renderer;
    if (!renderer) return;
    const target = this.qualityLevel === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    if (renderer.resolution === target) return;
    renderer.resolution = target;
    // With autoDensity, resize() is required for the buffer to reflect the new resolution
    // at the canvas's current CSS size (resizeTo: window already keeps width/height correct).
    renderer.resize(this.app.screen.width, this.app.screen.height);
  }
}
