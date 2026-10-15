export interface SeedDb {
  query(text: string, params?: readonly unknown[]): Promise<unknown>;
}

export interface SeedContext {
  db: SeedDb;
  /** deterministic PRNG — same named seed + seed value → same stream */
  rng: () => number;
}

export type SeedFn = (ctx: SeedContext) => Promise<void> | void;

/** Deterministic PRNG (mulberry32) — tiny, embeddable, no deps. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedRegistry {
  names(): string[];
  get(name: string): SeedFn;
}

/**
 * Named-seed registry. Seeds are named ("kyc-seed-v1") and deterministic:
 * every run of the same name + seed value produces identical fixtures.
 */
export function defineSeeds(seeds: Record<string, SeedFn>): SeedRegistry {
  return {
    names: () => Object.keys(seeds).sort(),
    get(name) {
      const fn = seeds[name];
      if (!fn) {
        throw new Error(
          `seed "${name}" not registered (have: ${Object.keys(seeds).join(", ")})`,
        );
      }
      return fn;
    },
  };
}

/** Run a named seed with a deterministic PRNG (default seed: 42). */
export async function runSeeds(
  db: SeedDb,
  registry: SeedRegistry,
  name: string,
  seedValue = 42,
): Promise<void> {
  await registry.get(name)({ db, rng: mulberry32(seedValue) });
}
