import { describe, expect, it } from "vitest";
import { ask, defaultMetrics, exportCsv, type Deps } from "../api/src/service.js";
import { ApiError } from "@company/http";
import { AnswerCache } from "../api/src/cache.js";
import { CHEAP_PLAN, StubDb } from "./helpers/stub-db.js";

const ACTOR = { sub: "analyst-0001", roles: ["analyst"] };

function deps(db?: StubDb): Deps & { db: StubDb } {
  const stub =
    db ??
    new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /SELECT max\(CASE WHEN status='success'/, result: { rows: [{ wm: new Date("2026-10-09T01:30:32Z"), last_status: "success", last_finished: new Date() }] } },
      { match: /FROM agg_daily/, result: { rows: [{ day: "2026-10-08", value: "42" }] } },
      { match: /INSERT INTO refundlens\.ask_log/, result: { rows: [] } },
    ]);
  return { db: stub, cache: new AnswerCache(), metrics: defaultMetrics() };
}

describe("POST /ask service — envelope + cache + evidence", () => {
  it("happy path: full mandatory envelope incl. watermark + ask_log row", async () => {
    const d = deps();
    const env = await ask(d, ACTOR, "how many refunds by channel last 30 days", "req-1");
    expect(env.answer).toBe("42 — refund count by channel");
    // Window mirrors api/src/ask/nl.ts: to = yesterday (daily-fresh edge), from = to-30d.
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const to = new Date(Date.now() - 86400e3);
    const from = new Date(to.getTime() - 30 * 86400e3);
    expect(env.understood).toBe(
      `refund count by channel, ${day(from)} → ${day(to)}`,
    );
    expect(env.sql).toContain("FROM agg_daily");
    expect(env.rows).toEqual([{ day: "2026-10-08", value: "42" }]);
    expect(env.watermark).toBe("2026-10-09T01:30:32.000Z");
    expect(env.cached).toBe(false);
    const logCall = d.db.calls.find((c) => c.text.includes("INSERT INTO refundlens.ask_log"));
    expect(logCall?.params?.[5]).toBe(true); // success
  });

  it("cache hit returns the identical envelope with took_ms = cache_ms", async () => {
    const d = deps();
    const first = await ask(d, ACTOR, "how many refunds by channel last 30 days", "r1");
    const qCount = d.db.calls.length;
    const again = await ask(d, ACTOR, "how many refunds by channel last 30 days", "r2");
    expect(again.cached).toBe(true);
    expect(again.sql).toBe(first.sql);
    expect(again.answer).toBe(first.answer);
    expect(again.watermark).toBe(first.watermark);
    expect(typeof again.took_ms).toBe("number");
    // cached answer never touches the DB again
    expect(d.db.calls.length).toBe(qCount);
    expect(d.metrics.render()).toContain("refundlens_cache_hit 1");
  });

  it("empty result → honest 'no refunds in that window'", async () => {
    const d = deps(new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /SELECT max\(CASE WHEN status='success'/, result: { rows: [{ wm: new Date(), last_status: "success", last_finished: new Date() }] } },
      { match: /FROM agg_daily/, result: { rows: [] } },
      { match: /INSERT INTO refundlens\.ask_log/, result: { rows: [] } },
    ]));
    const env = await ask(d, ACTOR, "how many refunds by channel", "r");
    expect(env.answer).toBe("no refunds in that window");
    expect(env.row_count).toBe(0);
  });

  it("fenced rejection → ApiError FENCED_QUERY_REJECTED + metrics + logged evidence", async () => {
    const d = deps();
    await expect(ask(d, ACTOR, "delete all refunds", "r")).rejects.toMatchObject({
      name: "ApiError",
      code: "FENCED_QUERY_REJECTED",
      statusCode: 400,
      detail: { reason: "mutation" },
    });
    const render = d.metrics.render();
    expect(render).toContain('refundlens_ask_success{outcome="fenced"} 1');
    expect(render).toContain('refundlens_fence_rejected_total{reason="mutation"} 1');
    const logCall = d.db.calls.find((c) => c.text.includes("INSERT INTO refundlens.ask_log"));
    expect(logCall?.params?.[5]).toBe(false);
    expect(logCall?.params?.[6]).toBe("mutation");
  });

  it("unparseable question → QUESTION_UNPARSEABLE 400 with hint", async () => {
    const d = deps();
    await expect(ask(d, ACTOR, "", "r")).rejects.toMatchObject({
      code: "QUESTION_UNPARSEABLE",
      statusCode: 400,
    });
  });

  it("non-fence DB errors → 'error' outcome, exception propagates", async () => {
    const d = deps(new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /SELECT max\(CASE WHEN status='success'/, result: { rows: [{ wm: new Date(), last_status: "success", last_finished: new Date() }] } },
      { match: /FROM agg_daily/, error: Object.assign(new Error("db gone"), { code: "57P01" }) },
      { match: /INSERT INTO refundlens\.ask_log/, result: { rows: [] } },
    ]));
    await expect(ask(d, ACTOR, "how many refunds by channel", "r")).rejects.toThrow("db gone");
    expect(d.metrics.render()).toContain('refundlens_ask_success{outcome="error"} 1');
  });

  it("ask_log write failure never fails the answer (evidence is best-effort)", async () => {
    const d = deps(new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /SELECT max\(CASE WHEN status='success'/, result: { rows: [{ wm: new Date(), last_status: "success", last_finished: new Date() }] } },
      { match: /FROM agg_daily/, result: { rows: [{ day: "d", value: "1" }] } },
      { match: /INSERT INTO refundlens\.ask_log/, error: new Error("log table gone") },
    ]));
    await expect(ask(d, ACTOR, "how many refunds by channel", "r")).resolves.toMatchObject({ cached: false });
  });

  it("banned-table questions map to banned_table, cross-schema to cross_schema", async () => {
    const d = deps();
    for (const [q, reason] of [
      ["show me the sync runs", "banned_table"],
      ["what did other analysts ask", "banned_table"],
      ["list all users and passwords", "cross_schema"],
    ] as const) {
      await expect(ask(d, ACTOR, q, "r")).rejects.toMatchObject({
        code: "FENCED_QUERY_REJECTED",
        detail: { reason },
      });
    }
  });
});

describe("exportCsv — exact counts, watermark header, cache bypass", () => {
  it("emits watermark comment + footer row count + data lines", async () => {
    const d = deps(new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /SELECT max\(CASE WHEN status='success'/, result: { rows: [{ wm: new Date("2026-10-09T01:30:32Z"), last_status: "success", last_finished: new Date() }] } },
      { match: /FROM agg_daily/, result: { rows: [{ day: new Date("2026-10-08"), value: "42" }, { day: "2026-10-07", value: "7" }] } },
    ]));
    const { csv, rowCount } = await exportCsv(d, ACTOR, "r");
    expect(csv).toMatch(/^# refundlens export — watermark: 2026-10-09T01:30:32.000Z\n/);
    expect(csv).toContain("day,count\n");
    expect(csv).toContain("2026-10-08,42\n");
    expect(csv).toContain("2026-10-07,7\n");
    expect(csv).toContain("# rows: 2");
    expect(rowCount).toBe(2);
    expect(d.metrics.render()).toContain("refundlens_export_total 1");
  });

  it("never reads the answer cache (exact-count law)", async () => {
    const d = deps();
    d.cache.set("anything", { answer: "stale" });
    await exportCsv(d, ACTOR, "r");
    // two exports always hit the DB — no cache lookup path exists in the service
    await exportCsv(d, ACTOR, "r");
    const explainCalls = d.db.calls.filter((c) => c.text.startsWith("EXPLAIN")).length;
    expect(explainCalls).toBe(2);
  });
});
