import { describe, expect, it } from "vitest";
import { generate, Unparseable } from "../api/src/ask/nl.js";
import { validateSql } from "../api/src/ask/fence.js";

const NOW = new Date("2026-10-15T12:00:00Z");

describe("NL generator — deterministic mapping onto typed params", () => {
  const WINDOWS: { q: string; from: string; to: string; label: string }[] = [
    { label: "default 30d", q: "refunds by channel", from: "2026-09-14", to: "2026-10-14" },
    { label: "last 7 days", q: "refunds by channel last 7 days", from: "2026-10-07", to: "2026-10-14" },
    { label: "last 1 day", q: "refunds by channel last 1 day", from: "2026-10-13", to: "2026-10-14" },
    { label: "last 2 weeks", q: "refunds by channel last 2 weeks", from: "2026-09-30", to: "2026-10-14" },
    { label: "last 3 months", q: "refunds by channel last 3 months", from: "2026-07-16", to: "2026-10-14" },
  ];
  for (const w of WINDOWS) {
    it(`window ${w.label} → ${w.from} → ${w.to} (to = yesterday)`, () => {
      const g = generate(w.q, NOW);
      expect(g.query.frame.from).toBe(w.from);
      expect(g.query.frame.to).toBe(w.to);
      expect(g.query.params.slice(0, 2)).toEqual([w.from, w.to]);
    });
  }

  const DIMS: { q: string; dim: string }[] = [
    { q: "refunds per day", dim: "day" },
    { q: "refunds by channel", dim: "channel" },
    { q: "refunds by rails", dim: "channel" },
    { q: "refunds by merchant segment", dim: "merchant_segment" },
    { q: "refunds per reason", dim: "reason_code" },
    // 'trend' matches the day-dim rule before 'reason' is considered —
    // word-order is the dim grammar's precedence, pinned here.
    { q: "refund trend by reason", dim: "day" },
  ];
  for (const d of DIMS) {
    it(`"${d.q}" → dim ${d.dim}`, () => {
      const g = generate(d.q, NOW);
      expect(g.query.sql).toMatch(new RegExp(`SELECT ${d.dim},`));
      expect(g.query.sql).toContain("GROUP BY");
    });
  }

  const METRICS: { q: string; expr: string }[] = [
    { q: "how many refunds by channel", expr: "SUM(cnt)::bigint" },
    { q: "refund amount by channel", expr: "SUM(amount)::bigint" },
    { q: "p95 latency by channel", expr: "AVG(p95_ms)::int" },
  ];
  for (const m of METRICS) {
    it(`"${m.q}" → metric ${m.expr}`, () => {
      expect(generate(m.q, NOW).query.sql).toContain(m.expr);
    });
  }

  // OPEN-4 (P1) — CLOSED by c1a55e8: filtersOf no longer slices the
  // FIELD_WORDS regex \b wrappers, so field=value filters bind as typed
  // eq params (window params first). Pinned green as regression cover.
  it("field=value filters bind as typed eq params (OPEN-4 — closed c1a55e8)", () => {
    const g = generate("refunds by channel channel=card state=pending", NOW);
    expect(g.query.params).toContain("CARD");
    expect(g.query.params).toContain("PENDING");
    expect(g.query.params[0]).toBe("2026-09-14");
    expect(g.query.params[1]).toBe("2026-10-14");
    expect(g.query.sql).toContain("channel = $");
  });

  it("'show me recent refunds' routes to the raw listing", () => {
    const g = generate("show me recent refunds", NOW);
    expect(g.query.sql).toContain("FROM refund_events_raw");
    expect(g.query.sql).toContain("LIMIT 100");
  });

  it("count questions beat show/list phrasing (agg wins)", () => {
    const g = generate("how many recent refunds by channel", NOW);
    expect(g.query.sql).toContain("FROM agg_daily");
  });

  it("empty / whitespace questions are Unparseable", () => {
    expect(() => generate("", NOW)).toThrow(Unparseable);
    expect(() => generate("   ", NOW)).toThrow(Unparseable);
  });

  it("EVERY generated statement passes the fence or dies fenced (never unrendered)", () => {
    const corpus = [
      "refunds by channel", "how many by reason last 7 days",
      "amount by segment", "p95 latency daily",
      "show me the rows", "list events",
      "refunds channel=WALLET last 90 days",
    ];
    for (const q of corpus) {
      const g = generate(q, NOW);
      const ast = validateSql(g.query.sql);
      expect(ast.kind).toBe("select");
    }
  });
});
