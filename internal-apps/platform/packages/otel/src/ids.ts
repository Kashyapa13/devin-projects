/**
 * Deterministic ID/value streams for seeded telemetry (otel-seed-v1).
 * Same seed → identical stream — the determinism contract the seeder's
 * stream hash relies on.
 */

/** FNV-1a 32-bit string hash — stable across runs and platforms. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededStream {
  /** 32-hex trace id. */
  traceId(): string;
  /** 16-hex span id. */
  spanId(): string;
  int(lo: number, hi: number): number;
  float(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function seededStream(seed: string): SeededStream {
  const rand = mulberry32(fnv1a(seed));
  const hex = (n: number): string => {
    let s = "";
    for (let i = 0; i < n; i++) s += Math.floor(rand() * 16).toString(16);
    return s;
  };
  return {
    traceId: () => hex(32),
    spanId: () => hex(16),
    int: (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)),
    float: (lo, hi) => lo + rand() * (hi - lo),
    pick: (arr) => arr[Math.floor(rand() * arr.length)]!,
  };
}
