/**
 * Message contract between the main thread and the generation/solver worker.
 *
 * WorkerRequestBody/WorkerResponseBody are defined first (without `id`) and `id` is added
 * by intersection — NEVER use `Omit<WorkerRequest, 'id'>`: `keyof` over a discriminated union
 * becomes the INTERSECTION of each variant's keys (here only 'id'|'kind'), so `Omit` would strip
 * the fields specific to each variant (`cfg`, `state`...). Building from the Body avoids the trap.
 */
import type { LevelConfig, GeneratedLevel } from '../generator';
import type { GameState, Move } from '../types';

export type WorkerRequestBody =
  | { kind: 'generateLevel'; cfg: LevelConfig; maxAttempts?: number; seed?: number }
  | { kind: 'nextHint'; state: GameState };

export type WorkerRequest = WorkerRequestBody & { id: number };

export type WorkerResponseBody =
  | { kind: 'generateLevel'; result: GeneratedLevel }
  | { kind: 'nextHint'; result: Move | null }
  | { kind: 'error'; message: string };

export type WorkerResponse = WorkerResponseBody & { id: number };
