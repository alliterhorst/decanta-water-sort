/**
 * Client for the generation/solver worker — ONE long-lived worker (created here, at module
 * boot, not one per call — creating a Worker has startup cost). When the environment lacks
 * Worker support (rare, but exotic sandboxes/webviews exist) it falls back to a direct
 * synchronous call — identical behavior, zero regression.
 *
 * Hardening (real field failure): on phones, an out-of-memory generation KILLS the worker
 * process outright — no 'error' event is guaranteed, the pending promise just hangs forever
 * and the phase-transition overlay stays black until the app is force-closed. Three layers
 * fix that:
 *  1. every call has a TIMEOUT — a hung/dead worker rejects instead of hanging;
 *  2. timeout/error TERMINATES and RESPAWNS the worker (a dead worker never comes back on
 *     its own — respawning is the only recovery);
 *  3. public calls retry ONCE on a fresh worker before failing, so a transient death is
 *     invisible to the player.
 */
import { generateLevel as generateLevelSync, mulberry32 } from '../generator';
import type { LevelConfig, GeneratedLevel } from '../generator';
import { nextHint as nextHintSync } from '../solver';
import type { GameState, Move } from '../types';
import type { WorkerRequestBody, WorkerRequest, WorkerResponse } from './protocol';

/** Only the slice of `Worker` the client uses — lets a test double be injected without DOM/browser. */
export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
}

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Generation can legitimately take a few seconds on weak phones — generous ceilings; they
 *  exist to catch a DEAD worker, not to race a slow one. */
const GENERATE_TIMEOUT_MS = 25_000;
const HINT_TIMEOUT_MS = 12_000;

/** Transport-level failure (dead/hung worker) — worth retrying on a fresh worker. A kind:'error'
 *  RESPONSE is not transient: the worker is alive and the computation failed deterministically. */
class TransientWorkerError extends Error {}

export class SolverClient {
  private worker: WorkerLike | null = null;
  private pending = new Map<number, PendingCall>();
  private nextId = 0;
  /** Test-injected double: never respawned (the test owns its lifecycle). */
  private readonly forced: boolean;

  constructor(opts?: { forceWorker?: WorkerLike }) {
    this.forced = !!opts?.forceWorker;
    if (opts?.forceWorker) {
      this.worker = opts.forceWorker;
      this.wire();
      return;
    }
    this.spawn();
  }

  private spawn(): void {
    if (typeof Worker === 'undefined') { this.worker = null; return; } // synchronous fallback
    try {
      this.worker = new Worker(
        new URL('./solver.worker.ts', import.meta.url),
        { type: 'module' },
      ) as unknown as WorkerLike;
      this.wire();
    } catch {
      this.worker = null; // environment refused to create the worker -> synchronous fallback
    }
  }

  private wire(): void {
    if (!this.worker) return;
    this.worker.onmessage = (ev) => this.handleMessage(ev.data);
    // Error not tied to a specific message (e.g. failure importing the worker script) —
    // without this, a pending promise would hang forever and the "preparing level" overlay would get stuck.
    this.worker.onerror = (ev) => this.handleFatalError(ev);
  }

  private handleMessage(res: WorkerResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return; // response for an id we no longer care about — safe to ignore
    this.pending.delete(res.id);
    if (p.timer) clearTimeout(p.timer);
    if (res.kind === 'error') p.reject(new Error(res.message));
    else p.resolve(res.result);
  }

  private handleFatalError(ev: ErrorEvent): void {
    const err = new TransientWorkerError(ev.message || 'Solver worker error');
    this.rejectAll(err);
    this.respawn();
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  /** Kills the current worker (dead or hung) and boots a fresh one. */
  private respawn(): void {
    if (this.forced) return; // test double: the test controls the lifecycle
    try { this.worker?.terminate(); } catch { /* already dead */ }
    this.worker = null;
    this.spawn();
  }

  /** True when calls actually run OFF the main thread. Background prefetching must check this:
   *  in the synchronous fallback (no Worker support), a "background" generation would run on the
   *  main thread and jank the current level — exactly what prefetch exists to avoid. */
  get usingWorker(): boolean {
    return this.worker !== null;
  }

  private callSync<T>(req: WorkerRequestBody): T {
    if (req.kind === 'generateLevel') {
      const rng = req.seed !== undefined ? mulberry32(req.seed) : Math.random;
      return generateLevelSync(req.cfg, req.maxAttempts, rng) as unknown as T;
    }
    return nextHintSync(req.state) as unknown as T;
  }

  private call<T>(req: WorkerRequestBody, timeoutMs: number): Promise<T> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(this.callSync<T>(req));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      // A worker killed by the OS (OOM) emits NOTHING — the timeout is the only signal.
      // On fire: drop the call, respawn the worker (it is unusable), and reject.
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return; // already settled
        this.respawn();
        reject(new TransientWorkerError(`Solver worker timed out after ${timeoutMs}ms (${req.kind})`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        worker.postMessage({ ...req, id } as WorkerRequest);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /** call() + ONE retry on a fresh worker — a transient worker death (timeout/fatal error) is
   *  invisible to the caller. Deterministic failures (kind:'error', terminate) do NOT retry. */
  private async callWithRetry<T>(req: WorkerRequestBody, timeoutMs: number): Promise<T> {
    try {
      return await this.call<T>(req, timeoutMs);
    } catch (err) {
      if (!(err instanceof TransientWorkerError)) throw err;
      return await this.call<T>(req, timeoutMs);
    }
  }

  generateLevel(cfg: LevelConfig, maxAttempts?: number, seed?: number): Promise<GeneratedLevel> {
    return this.callWithRetry<GeneratedLevel>(
      { kind: 'generateLevel', cfg, maxAttempts, seed }, GENERATE_TIMEOUT_MS,
    );
  }

  nextHint(state: GameState): Promise<Move | null> {
    return this.callWithRetry<Move | null>({ kind: 'nextHint', state }, HINT_TIMEOUT_MS);
  }

  /** For testing/cleanup only — the `solverClient` singleton below lives for the whole app. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('SolverClient terminated'));
  }
}

export const solverClient = new SolverClient();
