/**
 * 60s TTL answer cache keyed by normalized-SQL hash (AGENTS.md §4).
 * A hit returns the identical envelope with took_ms = cache_ms — the
 * envelope honestly reports it was not re-executed.
 * EXPORTS NEVER USE THIS (exact-count law).
 */
export class AnswerCache {
  private store = new Map<string, { at: number; envelope: unknown }>();
  constructor(private ttlMs = 60_000) {}

  get(key: string): { envelope: unknown; cacheMs: number } | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    const age = Date.now() - hit.at;
    if (age > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return { envelope: hit.envelope, cacheMs: Math.round(age) };
  }

  set(key: string, envelope: unknown): void {
    this.store.set(key, { at: Date.now(), envelope });
  }

  /** test hook */
  clear(): void {
    this.store.clear();
  }
}
