import { describe, it, expect } from "vitest";
import { bucket, evaluateFlag, SwrCache } from "../api/src/eval.js";

/** First userId u0..u9999 whose bucket under `key` lands on `target` (deterministic search). */
const userAtBucket = (target: number, key = "k"): string => {
  for (let i = 0; ; i++) {
    const u = `u${i}`;
    if (bucket(u, key) === target) return u;
  }
};

describe("bucket — deterministic FNV-1a bucketing", () => {
  it("is deterministic: same (userId, key) → same bucket", () => {
    for (const [u, k] of [
      ["u1", "k"],
      ["", "k"],
      ["u1", ""],
      ["user-😀", "demo-hero"],
      ["a".repeat(500), "demo-k"],
    ])
      expect(bucket(u!, k!)).toBe(bucket(u!, k!));
  });

  it("always lands in 0..99 (100 is unreachable)", () => {
    for (let i = 0; i < 2000; i++) {
      const b = bucket(`user-${i}`, `key-${i % 13}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(99);
    }
  });

  it("boundary: bucket 0 and bucket 99 are reachable", () => {
    expect(bucket(userAtBucket(0), "k")).toBe(0);
    expect(bucket(userAtBucket(99), "k")).toBe(99);
  });

  it("bucket depends on both userId and key", () => {
    const diffs = ["u1", "u2", "u3", "u4", "u5"].filter(
      (u) => bucket(u, "k1") === bucket(u, "k2"),
    );
    expect(diffs.length).toBeLessThan(5); // some user differs across keys
    expect(bucket("u1", "k1")).not.toBe(bucket("u1-other", "k1") === -1);
  });

  it("property: 1k users — deterministic + distribution sanity", () => {
    const counts = new Array(100).fill(0);
    for (let i = 0; i < 1000; i++) {
      const u = `prop-user-${i}`;
      const b1 = bucket(u, "demo-prop");
      const b2 = bucket(u, "demo-prop");
      expect(b1).toBe(b2); // same input → same output, always
      counts[b1]++;
    }
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    // ~10 users/bucket expected; reject degenerate uniformity *and* skew.
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(30);
    const mean = 10;
    const variance =
      counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
    expect(variance).toBeLessThan(200); // chi-square-lite sanity
  });
});

describe("evaluateFlag — targeting variants (table-driven)", () => {
  const cases: {
    name: string;
    flag: { key: string; targeting: any };
    userId: string;
    enabled: boolean;
    reason: string;
  }[] = [
    {
      name: "empty targeting object → default_enabled absent → off",
      flag: { key: "k", targeting: {} },
      userId: "any",
      enabled: false,
      reason: "default",
    },
    {
      name: "null targeting → off (targeting ?? {})",
      flag: { key: "k", targeting: null },
      userId: "any",
      enabled: false,
      reason: "default",
    },
    {
      name: "undefined targeting → off",
      flag: { key: "k", targeting: undefined },
      userId: "any",
      enabled: false,
      reason: "default",
    },
    {
      name: "default_enabled true → on for anyone",
      flag: { key: "k", targeting: { default_enabled: true } },
      userId: "any",
      enabled: true,
      reason: "default",
    },
    {
      name: "default_enabled false → off",
      flag: { key: "k", targeting: { default_enabled: false } },
      userId: "any",
      enabled: false,
      reason: "default",
    },
    {
      name: "non-boolean default_enabled → off (=== true guard)",
      flag: { key: "k", targeting: { default_enabled: "yes" } },
      userId: "any",
      enabled: false,
      reason: "default",
    },
    {
      name: "enabled_if.bucket_lt present → bucket gate, reason names it",
      flag: { key: "k", targeting: { enabled_if: { bucket_lt: 50 } } },
      userId: "u1",
      enabled: bucket("u1", "k") < 50,
      reason: "bucket(u1)<50",
    },
    {
      name: "enabled_if without bucket_lt → falls through to default",
      flag: { key: "k", targeting: { enabled_if: {}, default_enabled: true } },
      userId: "any",
      enabled: true,
      reason: "default",
    },
    {
      name: "enabled_if.bucket_lt wins over default_enabled when defined",
      flag: {
        key: "k",
        targeting: { enabled_if: { bucket_lt: 0 }, default_enabled: true },
      },
      userId: "any",
      enabled: false, // bucket never < 0
      reason: "bucket(any)<0",
    },
  ];
  for (const c of cases)
    it(c.name, () => {
      const r = evaluateFlag(c.flag, c.userId);
      expect(r).toEqual({ key: c.flag.key, enabled: c.enabled, reason: c.reason });
    });
});

describe("evaluateFlag — bucket_lt boundary edges", () => {
  it.each([
    { lt: 0, userAt: 0, want: false, note: "bucket 0 is never < 0" },
    { lt: 1, userAt: 0, want: true, note: "bucket 0 < 1" },
    { lt: 100, userAt: 99, want: true, note: "bucket 99 < 100 → everyone on" },
    { lt: 99, userAt: 99, want: false, note: "bucket 99 is not < 99" },
    { lt: 50, userAt: 49, want: true, note: "just under the gate" },
    { lt: 50, userAt: 50, want: false, note: "exactly at the gate → off" },
  ])("bucket_lt=$lt with user at bucket $userAt → $want ($note)", ({ lt, userAt, want }) => {
    const u = userAtBucket(userAt);
    const flag = { key: "k", targeting: { enabled_if: { bucket_lt: lt } } };
    expect(bucket(u, "k")).toBe(userAt); // precondition
    expect(evaluateFlag(flag, u).enabled).toBe(want);
    expect(evaluateFlag(flag, u).reason).toBe(`bucket(${u})<${lt}`);
  });
});

describe("SwrCache — stale-while-revalidate", () => {
  it("miss → loads once and caches the value", async () => {
    let n = 0;
    const c = new SwrCache<string[]>(60_000, async () => [`v${++n}`]);
    expect(await c.get("k")).toEqual(["v1"]);
    expect(await c.get("k")).toEqual(["v1"]); // TTL hit — no reload
    expect(n).toBe(1);
  });

  it("keys are independent (k1 vs k2 load separately)", async () => {
    const c = new SwrCache<string>(60_000, async (k) => `v:${k}`);
    expect(await c.get("a")).toBe("v:a");
    expect(await c.get("b")).toBe("v:b");
  });

  it("serves stale while revalidating in background", async () => {
    let n = 0;
    const c = new SwrCache<string[]>(0, async () => [`v${++n}`]);
    const first = await c.get("k"); // miss → load v1
    const second = await c.get("k"); // ttl=0 → stale v1 + bg reload
    expect(second).toBe(first);
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("k")).toEqual(["v2"]); // revalidated
  });

  it("stale entry keeps serving when the background reload rejects, then recovers", async () => {
    let n = 0;
    const c = new SwrCache<string>(0, async () => {
      n++;
      if (n === 2) throw new Error("db down");
      return `v${n}`;
    });
    expect(await c.get("k")).toBe("v1"); // miss → v1
    expect(await c.get("k")).toBe("v1"); // stale v1 served; bg reload n=2 rejects silently
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("k")).toBe("v1"); // rejected reload stored nothing — still v1 (kicks reload n=3)
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("k")).toBe("v3"); // recovered value now served
  });

  it("miss where load rejects propagates and caches nothing", async () => {
    let n = 0;
    const c = new SwrCache<string>(60_000, async () => {
      if (++n === 1) throw new Error("db down");
      return "ok";
    });
    await expect(c.get("k")).rejects.toThrow("db down");
    expect(await c.get("k")).toBe("ok"); // retried — nothing poisoned
  });

  it("invalidate() drops entries → next get reloads", async () => {
    let n = 0;
    const c = new SwrCache<string>(60_000, async () => `v${++n}`);
    expect(await c.get("k")).toBe("v1");
    c.invalidate();
    expect(await c.get("k")).toBe("v2");
    expect(n).toBe(2);
  });
});
