/** Deterministic bucketing: same userId+key → same result, forever. */
export function bucket(userId: string, key: string): number {
  let h = 2166136261;                       // FNV-1a
  for (const c of `${userId}:${key}`) {
    h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 100;
}
export interface EvalResult { key: string; enabled: boolean; reason: string }
export function evaluateFlag(flag: { key: string; targeting: any },
                             userId: string): EvalResult {
  const t = flag.targeting ?? {};
  if (t.enabled_if?.bucket_lt !== undefined)
    return { key: flag.key, enabled: bucket(userId, flag.key) < t.enabled_if.bucket_lt,
      reason: `bucket(${userId})<${t.enabled_if.bucket_lt}` };
  return { key: flag.key, enabled: t.default_enabled === true, reason: "default" };
}
/* stale-while-revalidate cache: serve last-known while refreshing in bg. */
export class SwrCache<V> {
  private m = new Map<string, { v: V; at: number }>();
  private inflight = new Map<string, Promise<V>>();
  private gen = 0;                                  // bumped by invalidate() — stale loads can't re-fill
  constructor(private ttlMs = 30_000, private load: (k: string) => Promise<V>) {}
  async get(k: string): Promise<V> {
    const e = this.m.get(k);
    if (e && Date.now() - e.at < this.ttlMs) return e.v;
    if (e) {
      void this.refresh(k).catch(() => {});        // stale-while-revalidate; keep last-known on failure
      return e.v;
    }
    return this.refresh(k);
  }
  /** One in-flight load per key; installs only if no invalidate() raced it. */
  private refresh(k: string): Promise<V> {
    const p = this.inflight.get(k);
    if (p) return p;
    const g = this.gen;
    const q = this.load(k)
      .then((v) => { if (this.gen === g) this.m.set(k, { v, at: Date.now() }); return v; })
      .finally(() => { if (this.inflight.get(k) === q) this.inflight.delete(k); });
    this.inflight.set(k, q);
    return q;
  }
  invalidate() { this.gen++; this.m.clear(); this.inflight.clear(); }
}
