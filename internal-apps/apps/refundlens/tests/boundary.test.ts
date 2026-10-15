import { describe, expect, it } from "vitest";
import { renderAggQuery, renderRawQuery } from "../api/src/ask/templates.js";
import { FencedRejection, validateSql } from "../api/src/ask/fence.js";
import { AnswerCache } from "../api/src/cache.js";
import { currentWatermark } from "../api/src/watermark.js";
import { StubDb } from "./helpers/stub-db.js";

/**
 * Boundary tables (TESTING.md §UT): daterange edges, LIMIT edges,
 * empty-result, cache TTL edges, watermark edges. Each table row names
 * the exact edge and the contract it pins.
 */

describe("daterange edges", () => {
  const CASES: { from: string; to: string; ok: boolean; label: string }[] = [
    { label: "well-formed", from: "2026-01-01", to: "2026-01-31", ok: true },
    { label: "same day (degenerate window)", from: "2026-01-01", to: "2026-01-01", ok: true },
    { label: "from > to renders (empty window by construction)", from: "2026-02-01", to: "2026-01-01", ok: true },
    { label: "format-valid impossible date renders (exec layer owns)", from: "2026-13-45", to: "2026-14-99", ok: true },
    { label: "short month", from: "2026-1-1", to: "2026-01-31", ok: false },
    { label: "iso datetime rejected (date only)", from: "2026-01-01T00:00:00Z", to: "2026-01-31", ok: false },
    { label: "injection-shaped date", from: "1/1/26'; DROP--", to: "2026-01-31", ok: false },
    { label: "empty string", from: "", to: "2026-01-31", ok: false },
    { label: "non-date to", from: "2026-01-01", to: "tomorrow", ok: false },
  ];
  for (const c of CASES) {
    it(`${c.label}: ${c.from} → ${c.to}`, () => {
      const go = () =>
        renderAggQuery({ dim: "day", metric: "count", from: c.from, to: c.to });
      if (c.ok) expect(go().params.slice(0, 2)).toEqual([c.from, c.to]);
      else expect(go).toThrow(/invalid (from|to) date/);
    });
  }
});

describe("LIMIT edges — renderer clamps, fence enforces", () => {
  const RENDER: { limit: number | undefined; want: number; label: string }[] = [
    { label: "default 500", limit: undefined, want: 500 },
    { label: "min sane", limit: 1, want: 1 },
    { label: "499", limit: 499, want: 499 },
    { label: "500", limit: 500, want: 500 },
    { label: "at cap 5000", limit: 5000, want: 5000 },
    { label: "over cap 5001 clamps to 5000", limit: 5001, want: 5000 },
    { label: "huge clamps to 5000", limit: 999_999_999, want: 5000 },
    { label: "zero renders LIMIT 0 (legal, empty)", limit: 0, want: 0 },
  ];
  for (const c of RENDER) {
    it(`renderAggQuery ${c.label}`, () => {
      const q = renderAggQuery({
        dim: "day", metric: "count", from: "2026-01-01", to: "2026-01-31",
        ...(c.limit === undefined ? {} : { limit: c.limit }),
      });
      expect(q.sql).toContain(`LIMIT ${c.want}`);
    });
  }

  const FENCE: { limit: string; reason: string | null; label: string }[] = [
    { label: "LIMIT 1", limit: "1", reason: null },
    { label: "LIMIT 4999", limit: "4999", reason: null },
    { label: "LIMIT 5000 (cap, inclusive)", limit: "5000", reason: null },
    { label: "LIMIT 5001", limit: "5001", reason: "limit_over_cap" },
    { label: "LIMIT ALL", limit: "ALL", reason: "no_limit" },
    { label: "no LIMIT", limit: "", reason: "no_limit" },
    { label: "negative limit fails the literal parse", limit: "-1", reason: "parse_failure" },
    { label: "param LIMIT fails the literal parse", limit: "$3", reason: "parse_failure" },
  ];
  for (const c of FENCE) {
    it(`fence ${c.label}`, () => {
      const sql = `SELECT day FROM refundlens.agg_daily ${c.limit ? `LIMIT ${c.limit}` : ""}`;
      if (c.reason === null) {
        expect(validateSql(sql).kind).toBe("select");
      } else {
        try {
          validateSql(sql);
          expect.unreachable(`expected ${c.reason}`);
        } catch (e) {
          expect((e as FencedRejection).reason).toBe(c.reason);
        }
      }
    });
  }
});

describe("empty-result + cache TTL edges", () => {
  it("cache miss before set, hit within TTL, evicted past TTL", () => {
    const c = new AnswerCache(60_000);
    expect(c.get("k")).toBeNull();
    c.set("k", { answer: "x" });
    const hit = c.get("k");
    expect(hit?.envelope).toEqual({ answer: "x" });
    expect(typeof hit?.cacheMs).toBe("number");
  });

  it("an entry past its TTL is evicted on read", async () => {
    const c = new AnswerCache(1); // 1ms — the smallest live window
    c.set("k", { answer: "x" });
    await new Promise((r) => setTimeout(r, 10));
    expect(c.get("k")).toBeNull();
  });
});

describe("watermark edges", () => {
  const stub = (rows: Record<string, unknown>[]) =>
    new StubDb([{ match: /FROM refundlens\.sync_runs/, result: { rows } }]);

  it("no sync_runs → nulls across the envelope (watermark present, value null)", async () => {
    const wm = await currentWatermark(stub([{ wm: null, last_status: null, last_finished: null }]));
    expect(wm).toEqual({ watermark: null, lag_s: null, last_run_status: null });
  });

  it("successful run → watermark ISO + non-negative lag", async () => {
    const wm = await currentWatermark(
      stub([{ wm: new Date(Date.now() - 61_000), last_status: "success", last_finished: new Date() }]),
    );
    expect(wm.watermark).toMatch(/T.*Z/);
    expect(wm.lag_s).toBeGreaterThanOrEqual(60);
    expect(wm.last_run_status).toBe("success");
  });

  it("future watermark clamps lag to 0 (never negative)", async () => {
    const wm = await currentWatermark(
      stub([{ wm: new Date(Date.now() + 60_000), last_status: "success", last_finished: new Date() }]),
    );
    expect(wm.lag_s).toBe(0);
  });

  it("latest row's status is reported even when the last run errored", async () => {
    const wm = await currentWatermark(
      stub([{ wm: new Date(), last_status: "error", last_finished: new Date() }]),
    );
    expect(wm.last_run_status).toBe("error");
    expect(wm.watermark).toBeTruthy(); // last SUCCESS watermark still surfaces
  });
});

describe("raw-listing filters — typed params, all ops", () => {
  it("eq/ne/like filters render as bound params (never inlined)", () => {
    const q = renderRawQuery({
      from: "2026-01-01", to: "2026-01-31",
      filters: [
        { field: "state", op: "eq", value: "PENDING" },
        { field: "channel", op: "ne", value: "CARD" },
        { field: "reason_code", op: "like", value: "FRAUD%" },
      ],
    });
    expect(q.sql).toContain("state = $3");
    expect(q.sql).toContain("channel <> $4");
    expect(q.sql).toContain("reason_code ILIKE $5");
    expect(q.params).toEqual(["2026-01-01", "2026-01-31", "PENDING", "CARD", "FRAUD%"]);
    expect(q.sql).not.toContain("'PENDING'");
  });

  it("unknown filter field / op are rejected before render", () => {
    expect(() =>
      renderRawQuery({
        from: "2026-01-01", to: "2026-01-31",
        filters: [{ field: "pan" as never, op: "eq", value: "x" }],
      }),
    ).toThrow(/unknown filter field/);
    expect(() =>
      renderRawQuery({
        from: "2026-01-01", to: "2026-01-31",
        filters: [{ field: "state", op: "regex" as never, value: "x" }],
      }),
    ).toThrow(/unknown filter op/);
    expect(() =>
      renderRawQuery({ from: "bad", to: "2026-01-31" }),
    ).toThrow(/invalid from date/);
  });
});

describe("empty-result contract", () => {
  it("renderRawQuery empty window still emits LIMIT (never unbounded)", () => {
    const q = renderRawQuery({ from: "2026-02-01", to: "2026-01-01" });
    expect(q.sql).toContain("LIMIT");
  });
});
