/**
 * Web Worker entry: just a messaging adapter on top of the pure engine (`core/generator.ts`,
 * `core/solver.ts`) — the logic does not change a single line, it just runs off the main thread.
 *
 * `postMessage` here is called without a `self`/`window` qualifier on purpose: with the tsconfig
 * `lib` including "DOM" (for the rest of the app), TypeScript would resolve `self.postMessage`
 * to the `Window` overload (which requires `targetOrigin`) instead of the `DedicatedWorkerGlobalScope`
 * one (message only). `globalThis as unknown as Worker` isolates this single call from the type
 * conflict without needing a separate tsconfig just for this file.
 */
import { generateLevel, mulberry32 } from '../generator';
import { nextHint } from '../solver';
import type { WorkerRequest, WorkerResponse } from './protocol';

const post = (globalThis as unknown as Worker).postMessage.bind(globalThis);

addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.kind === 'generateLevel') {
      const rng = req.seed !== undefined ? mulberry32(req.seed) : Math.random;
      const result = generateLevel(req.cfg, req.maxAttempts, rng);
      post({ id: req.id, kind: 'generateLevel', result } satisfies WorkerResponse);
    } else {
      const result = nextHint(req.state);
      post({ id: req.id, kind: 'nextHint', result } satisfies WorkerResponse);
    }
  } catch (err) {
    post({
      id: req.id,
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
});
