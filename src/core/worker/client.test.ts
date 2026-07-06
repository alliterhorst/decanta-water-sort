import { describe, it, expect, vi } from 'vitest';
import { SolverClient, type WorkerLike } from './client';
import { generateLevel } from '../generator';
import type { WorkerRequest, WorkerResponse } from './protocol';

const CFG = { colors: 4, capacity: 4, emptyTubes: 2 };

describe('SolverClient — synchronous fallback (the Vitest environment has no global Worker)', () => {
  it('typeof Worker is undefined in Node — confirms this block actually tests the fallback path', () => {
    expect(typeof Worker).toBe('undefined');
  });

  it('generateLevel via fallback produces the same result as the direct call (same seed)', async () => {
    const client = new SolverClient();
    const [viaClient, viaDireto] = await Promise.all([
      client.generateLevel(CFG, 200, 42),
      Promise.resolve(generateLevel(CFG, 200, (() => {
        // same seed 42 via mulberry32 — reimplemented here only to compare, without importing
        // internals; the client already tests mulberry32(42) internally the same way.
        let a = 42 >>> 0;
        return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      })())),
    ]);
    expect(viaClient.state.tubes).toEqual(viaDireto.state.tubes);
    expect(viaClient.optimalMoves).toEqual(viaDireto.optimalMoves);
  });

  it('nextHint via fallback resolves to a valid move or null', async () => {
    const client = new SolverClient();
    const lvl = generateLevel(CFG);
    const mv = await client.nextHint(lvl.state);
    if (mv) {
      expect(mv).toHaveProperty('from');
      expect(mv).toHaveProperty('to');
    } else {
      expect(mv).toBeNull();
    }
  });
});

describe('SolverClient — message protocol (injected worker, tests correlation without needing a browser)', () => {
  function makeFakeWorker() {
    const listeners: { onmessage: WorkerLike['onmessage']; onerror: WorkerLike['onerror'] } = {
      onmessage: null,
      onerror: null,
    };
    const posted: WorkerRequest[] = [];
    const fake: WorkerLike = {
      postMessage: (msg) => posted.push(msg),
      terminate: vi.fn(),
      get onmessage() { return listeners.onmessage; },
      set onmessage(v) { listeners.onmessage = v; },
      get onerror() { return listeners.onerror; },
      set onerror(v) { listeners.onerror = v; },
    };
    const respond = (res: WorkerResponse) => {
      listeners.onmessage?.({ data: res } as MessageEvent<WorkerResponse>);
    };
    const fail = (message: string) => {
      listeners.onerror?.({ message } as ErrorEvent);
    };
    return { fake, posted, respond, fail };
  }

  it('correlates request/response by id — two concurrent calls do not cross', async () => {
    const { fake, posted, respond } = makeFakeWorker();
    const client = new SolverClient({ forceWorker: fake });

    const p1 = client.generateLevel(CFG);
    const p2 = client.generateLevel({ ...CFG, colors: 5 });
    expect(posted).toHaveLength(2);
    expect(posted[0].id).not.toBe(posted[1].id);

    const lvl2 = generateLevel({ ...CFG, colors: 5 });
    const lvl1 = generateLevel(CFG);
    // Responds out of order (2nd call's id first) — id correlation must still get it right.
    respond({ id: posted[1].id, kind: 'generateLevel', result: lvl2 });
    respond({ id: posted[0].id, kind: 'generateLevel', result: lvl1 });

    await expect(p1).resolves.toEqual(lvl1);
    await expect(p2).resolves.toEqual(lvl2);
  });

  it('a kind:"error" response rejects the right promise (does not take down the other pending ones)', async () => {
    const { fake, posted, respond } = makeFakeWorker();
    const client = new SolverClient({ forceWorker: fake });

    const pFail = client.generateLevel(CFG);
    const pOk = client.nextHint(generateLevel(CFG).state);
    respond({ id: posted[0].id, kind: 'error', message: 'invalid config' });
    respond({ id: posted[1].id, kind: 'nextHint', result: null });

    await expect(pFail).rejects.toThrow('invalid config');
    await expect(pOk).resolves.toBeNull();
  });

  it('a fatal worker error (onerror) triggers ONE transparent retry — a success on the retried post resolves the original promise', async () => {
    const { fake, posted, respond, fail } = makeFakeWorker();
    const client = new SolverClient({ forceWorker: fake });

    const p1 = client.generateLevel(CFG);
    expect(posted).toHaveLength(1);
    fail('worker died (OOM)');
    // the transient failure re-posts the request (retry on the respawned worker)
    await Promise.resolve(); // lets the catch in callWithRetry run
    expect(posted).toHaveLength(2);

    const lvl = generateLevel(CFG);
    respond({ id: posted[1].id, kind: 'generateLevel', result: lvl });
    await expect(p1).resolves.toEqual(lvl);
  });

  it('a SECOND fatal error (retry also died) rejects for real — without this the overlay would hang forever', async () => {
    const { fake, posted, fail } = makeFakeWorker();
    const client = new SolverClient({ forceWorker: fake });

    const p1 = client.generateLevel(CFG);
    fail('worker died (OOM)');
    await Promise.resolve(); // retry re-posts
    expect(posted).toHaveLength(2);
    fail('worker died again');

    await expect(p1).rejects.toThrow('worker died again');
  });

  it('terminate() rejects pending calls and releases the worker reference', async () => {
    const { fake } = makeFakeWorker();
    const client = new SolverClient({ forceWorker: fake });
    const p = client.generateLevel(CFG);
    client.terminate();
    await expect(p).rejects.toThrow();
    expect(fake.terminate).toHaveBeenCalledOnce();
  });

  it('a response with an unknown id is silently ignored (does not throw)', () => {
    const { fake, respond } = makeFakeWorker();
    new SolverClient({ forceWorker: fake });
    expect(() => respond({ id: 999, kind: 'nextHint', result: null })).not.toThrow();
  });
});
