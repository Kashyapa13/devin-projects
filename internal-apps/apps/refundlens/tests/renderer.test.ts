import { describe, expect, it } from "vitest";
import { renderAggQuery, renderRawQuery } from "../api/src/ask/templates.js";
import { LIMIT_MAX } from "../api/src/ask/fence.js";

/**
 * Template renderer contract (LLD): typed params only, values always
 * bound, identifiers only from registries. Param fuzzing = injection
 * attempts must stay bound parameters, never reach the SQL text.
 */
describe("template renderer — typed params contract", () => {
  it("renders agg query with bound window + filters", () => {
    const q = renderAggQuery({
      dim: "channel",
      metric: "count",
      from: "2026-09-01",
      to: "2026-09-30",
      filters: [{ field: "merchant_segment", op: "eq", value: "SMB" }],
    });
    expect(q.sql).toContain("FROM agg_daily");
    expect(q.sql).toContain("LIMIT 500");
    expect(q.params).toEqual(["2026-09-01", "2026-09-30", "SMB"]);
    expect(q.sql).not.toContain("SMB"); // value is bound, never inlined
  });

  it("clamps limit to the cap", () => {
    const q = renderAggQuery({
      dim: "day", metric: "amount", from: "2026-01-01", to: "2026-01-31",
      limit: 99999,
    });
    expect(q.sql).toContain(`LIMIT ${LIMIT_MAX}`);
  });

  it("injection-shaped filter values stay bound params", () => {
    const evil = "x'; DROP TABLE agg_daily; --";
    const q = renderAggQuery({
      dim: "reason_code", metric: "count", from: "2026-01-01", to: "2026-02-01",
      filters: [{ field: "reason_code", op: "eq", value: evil }],
    });
    expect(q.sql).not.toContain("DROP");
    expect(q.params).toContain(evil); // the payload is data, not SQL
  });

  it("rejects unknown dims/metrics/filter fields — no identifier injection", () => {
    expect(() =>
      renderAggQuery({ dim: "evil; drop" as never, metric: "count", from: "2026-01-01", to: "2026-01-02" }),
    ).toThrow(/unknown dim/);
    expect(() =>
      renderAggQuery({ dim: "day", metric: "password" as never, from: "2026-01-01", to: "2026-01-02" }),
    ).toThrow(/unknown metric/);
    expect(() =>
      renderAggQuery({
        dim: "day", metric: "count", from: "2026-01-01", to: "2026-01-02",
        filters: [{ field: "secret" as never, op: "eq", value: "x" }],
      }),
    ).toThrow(/unknown filter field/);
  });

  it("rejects malformed dates before they reach SQL", () => {
    expect(() =>
      renderAggQuery({ dim: "day", metric: "count", from: "1/1/26;--", to: "2026-01-02" }),
    ).toThrow(/invalid from date/);
  });

  it("raw listing renders bounds + cap", () => {
    const q = renderRawQuery({ from: "2026-09-01", to: "2026-09-30", limit: 100 });
    expect(q.sql).toContain("FROM refund_events_raw");
    expect(q.sql).toContain("LIMIT 100");
  });
});
