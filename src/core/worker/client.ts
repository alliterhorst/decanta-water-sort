/**
 * Client for the generation/solver worker — ONE long-lived worker (created here, at module
 * boot, not one per call — creating a Worker has startup cost). When the environment lacks
 * Worker support (rare, but exotic sandboxes/webviews exist) it falls back to a direct
 * synchronous call — identical behavior, zero regression.
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
}

export class SolverClient {
  private worker: WorkerLike | null = null;
  private pending = new Map<number, PendingCall>();
  private nextId = 0;

  constructor(opts?: { forceWorker?: WorkerLike }) {
    if (opts?.forceWorker) {
      this.worker = opts.forceWorker;
      this.wire();
      return;
    }
    if (typeof Worker === 'undefined') return; // stays worker=null -> synchronous fallback
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
    if (res.kind === 'error') p.reject(new Error(res.message));
    else p.resolve(res.result);
  }

  private handleFatalError(ev: ErrorEvent): void {
    const err = new Error(ev.message || 'Solver worker error');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private callSync<T>(req: WorkerRequestBody): T {
    if (req.kind === 'generateLevel') {
      const rng = req.seed !== undefined ? mulberry32(req.seed) : Math.random;
      return generateLevelSync(req.cfg, req.maxAttempts, rng) as unknown as T;
    }
    return nextHintSync(req.state) as unknown as T;
  }

  private call<T>(req: WorkerRequestBody): Promise<T> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(this.callSync<T>(req));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  generateLevel(cfg: LevelConfig, maxAttempts?: number, seed?: number): Promise<GeneratedLevel> {
    return this.call<GeneratedLevel>({ kind: 'generateLevel', cfg, maxAttempts, seed });
  }

  nextHint(state: GameState): Promise<Move | null> {
    return this.call<Move | null>({ kind: 'nextHint', state });
  }

  /** For testing/cleanup only — the `solverClient` singleton below lives for the whole app. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('SolverClient terminated'));
    this.pending.clear();
  }
}

export const solverClient = new SolverClient();
