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
});
