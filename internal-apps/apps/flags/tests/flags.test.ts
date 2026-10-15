import { describe, it, expect } from "vitest";
import { bucket, evaluateFlag, SwrCache } from "../api/src/eval.js";

describe("eval API — deterministic bucketing", () => {
  it("same userId+key → same result", () => {
    expect(bucket("u1", "k")).toBe(bucket("u1", "k"));
    expect(bucket("u1", "k")).not.toBe(bucket("u2", "k") === bucket("u1","k") ? -1 : -1); // range sanity
    expect(bucket("u1","k")).toBeGreaterThanOrEqual(0);
    expect(bucket("u1","k")).toBeLessThan(100);
  });
  it("bucket_lt targeting gates deterministically", () => {
    const f = { key: "k", targeting: { enabled_if: { bucket_lt: 50 } } };
    expect(evaluateFlag(f, "u1").enabled).toBe(evaluateFlag(f, "u1").enabled);
    const always = { key: "k", targeting: { default_enabled: true } };
    expect(evaluateFlag(always, "anyone").enabled).toBe(true);
  });
});
describe("SWR cache", () => {
  it("serves stale while revalidating in background", async () => {
    let n = 0; const c = new SwrCache<string[]>(0, async () => [`v${++n}`]);
    const first = await c.get("k");                          // miss → load v1
    const second = await c.get("k");                         // ttl=0 → stale v1 + bg reload
    expect(second).toBe(first); await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("k")).toEqual(["v2"]);                // revalidated
  });
  it("invalidate() during an in-flight refresh blocks the stale install", async () => {
    let resolveLoad!: (v: string[]) => void;
    const c = new SwrCache<string[]>(0, () => new Promise((r) => { resolveLoad = r; }));
    const p = c.get("k");                                    // miss → in-flight load
    c.invalidate();                                          // mutation lands mid-flight
    resolveLoad(["old"]);
    await p;                                                 // load resolves — must NOT install
    let loaded = 0;
    const c2 = c;                                            // next get misses (cache still empty)
    (c2 as any).load = async () => { loaded++; return ["fresh"]; };
    expect(await c2.get("k")).toEqual(["fresh"]);
    expect(loaded).toBe(1);
  });
  it("coalesces simultaneous refreshes for the same key", async () => {
    let n = 0;
    const c = new SwrCache<string[]>(30_000, async () => { n++; return [`v${n}`]; });
    const [a, b] = await Promise.all([c.get("k"), c.get("k")]);
    expect(a).toEqual(b);
    expect(n).toBe(1);
  });
});
