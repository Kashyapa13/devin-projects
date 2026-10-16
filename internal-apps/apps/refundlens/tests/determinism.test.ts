import { describe, expect, it } from "vitest";
import { generate } from "../api/src/ask/nl.js";
import { renderAggQuery, renderRawQuery } from "../api/src/ask/templates.js";
import { cacheKey, normalizeSql } from "../api/src/ask/executor.js";

/**
 * Property tests — share-link determinism (TESTING.md §UT + F-01):
 * the same typed params must always render the same statement and the
 * same cache signature. A share link IS the typed-param state; its
 * signature is the rendered SQL + bound params hash. Deterministic
 * seeded corpus (mulberry32) — no new deps.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date("2026-10-15T12:00:00Z");
const QUESTIONS = [
  "how many refunds by channel last 30 days",
  "refund amount by reason last 7 days",
  "p95 latency by segment last 2 weeks",
  "how many refunds by day last 3 months",
  "refund rate by channel",
  "show me recent refunds",
  "refunds by merchant segment channel=CARD",
  "count by reason_code state=PENDING",
];

describe("share-link determinism — same inputs → same link/signature", () => {
  it("generate() is a pure function of (question, now)", () => {
    for (const q of QUESTIONS) {
      const a = generate(q, NOW);
      const b = generate(q, new Date(NOW.getTime()));
      expect(a.query).toEqual(b.query);
      expect(a.understood).toBe(b.understood);
    }
  });

  it("seeded corpus: repeated renders are byte-identical", () => {
    const rnd = mulberry32(0x5eed);
    for (let i = 0; i < 100; i++) {
      const q = QUESTIONS[Math.floor(rnd() * QUESTIONS.length)]!;
      const g1 = generate(q, NOW);
      const g2 = generate(q, NOW);
      expect(g2.query.sql).toBe(g1.query.sql);
      expect(g2.query.params).toEqual(g1.query.params);
      // the share signature (cache key) is the rendered SQL + bound params
      expect(cacheKey(g1.query.sql, g1.query.params)).toBe(
        cacheKey(g2.query.sql, g2.query.params),
      );
    }
  });

  it("typed-param renderers are byte-deterministic across equivalent inputs", () => {
    const p = {
      dim: "channel" as const, metric: "amount" as const,
      from: "2026-09-01", to: "2026-10-01",
      filters: [{ field: "state" as const, op: "eq" as const, value: "PENDING" }],
    };
    expect(renderAggQuery(p).sql).toBe(renderAggQuery({ ...p }).sql);
    expect(renderRawQuery({ from: p.from, to: p.to }).sql).toBe(
      renderRawQuery({ from: "2026-09-01", to: "2026-10-01" }).sql,
    );
  });

  it("cache signature is insensitive to SQL whitespace/case (normalization)", () => {
    const a = "SELECT day FROM agg_daily WHERE day BETWEEN $1 AND $2 LIMIT 500";
    const b = "select   day\nFROM\tagg_daily where day between $1 and $2 limit 500";
    expect(normalizeSql(a)).toBe(normalizeSql(b));
    expect(cacheKey(a, ["x"])).toBe(cacheKey(b, ["x"]));
  });

  it("cache signature IS sensitive to bound params (params change results)", () => {
    const sql = "SELECT day FROM agg_daily LIMIT 1";
    expect(cacheKey(sql, ["a", "b"])).not.toBe(cacheKey(sql, ["b", "a"]));
    expect(cacheKey(sql, ["a"])).not.toBe(cacheKey(sql, ["a", "b"]));
  });

  it("question-synonyms may collide but distinct intents never do", () => {
    const keys = new Set(
      QUESTIONS.map((q) => cacheKey(generate(q, NOW).query.sql, generate(q, NOW).query.params)),
    );
    // 8 questions → 7 distinct signatures post-OPEN-4 (c1a55e8):
    // filtered questions now bind their filters and split away from
    // unfiltered ones. The remaining collision is a metric gap, not a
    // filter drop: "refund rate by channel" renders byte-identical SQL
    // to "how many refunds by channel" (rate phrasing falls back to the
    // count template) → OPEN-7. Asserted exactly so a regression fails
    // loudly in either direction.
    expect(keys.size).toBe(7);
  });
});
