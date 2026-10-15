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
  constructor(private ttlMs = 30_000, private load: (k: string) => Promise<V>) {}
  async get(k: string): Promise<V> {
    const e = this.m.get(k);
    if (e && Date.now() - e.at < this.ttlMs) return e.v;
    if (e) { this.load(k).then((v) => this.m.set(k, { v, at: Date.now() })).catch(() => {});
             return e.v; }                                  // stale-while-revalidate
    const v = await this.load(k); this.m.set(k, { v, at: Date.now() }); return v;
  }
  invalidate() { this.m.clear(); }
}
