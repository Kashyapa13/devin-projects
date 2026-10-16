import { describe, expect, it } from "vitest";
import { runFenced } from "../api/src/ask/executor.js";
import { FencedRejection } from "../api/src/ask/fence.js";
import { CHEAP_PLAN, EXPENSIVE_PLAN, StubDb, timeoutError } from "./helpers/stub-db.js";

const GOOD = "SELECT day FROM refundlens.agg_daily LIMIT 10";

describe("runFenced — enforcement order: AST → session pins → EXPLAIN → execute", () => {
  it("issues SET search_path + statement_timeout, EXPLAINs, then runs", async () => {
    const db = new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /FROM refundlens\.agg_daily/, result: { rows: [{ day: "d" }] } },
    ]);
    const r = await runFenced(db, GOOD, []);
    expect(r.rows).toEqual([{ day: "d" }]);
    const texts = db.texts();
    expect(texts[0]).toContain("search_path = refundlens");
    expect(texts[1]).toContain("statement_timeout = 5000");
    expect(texts[2]).toMatch(/^EXPLAIN SELECT/);
    expect(texts[3]).toBe(GOOD); // the real statement runs last
  });

  it("over-cap EXPLAIN cost → cost_cap rejection, query never executes", async () => {
    const db = new StubDb([{ match: /^EXPLAIN /, result: EXPENSIVE_PLAN }]);
    await expect(runFenced(db, GOOD, [])).rejects.toMatchObject({
      name: "FencedRejection",
      reason: "cost_cap",
    });
    expect(db.texts().some((t) => t === GOOD)).toBe(false);
  });

  it("statement_timeout (57014) → FencedRejection 'timeout'", async () => {
    const db = new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: new RegExp(`^${GOOD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), error: timeoutError() },
    ]);
    await expect(runFenced(db, GOOD, [])).rejects.toMatchObject({ reason: "timeout" });
  });

  it("non-timeout DB errors pass through untouched", async () => {
    const boom = new Error("relation gone") as Error & { code?: string };
    boom.code = "42P01";
    const db = new StubDb([
      { match: /^EXPLAIN /, result: CHEAP_PLAN },
      { match: /FROM refundlens\.agg_daily/, error: boom },
    ]);
    await expect(runFenced(db, GOOD, [])).rejects.toBe(boom);
  });

  it("fences run before ANY db call — invalid SQL never reaches the wire", async () => {
    const db = new StubDb();
    await expect(
      runFenced(db, "DELETE FROM refundlens.agg_daily", []),
    ).rejects.toBeInstanceOf(FencedRejection);
    expect(db.calls).toHaveLength(0);
  });

  it("opts override the timeout/costCap (still bounded)", async () => {
    const db = new StubDb([{ match: /^EXPLAIN /, result: CHEAP_PLAN }]);
    await runFenced(db, GOOD, [], { timeoutMs: 1234, costCap: 500 });
    expect(db.texts()[1]).toContain("statement_timeout = 1234");
    // plan total 120.5 > cap 500? no — under, executes
    const db2 = new StubDb([{ match: /^EXPLAIN /, result: CHEAP_PLAN }]);
    await expect(
      runFenced(db2, GOOD, [], { costCap: 100 }),
    ).rejects.toMatchObject({ reason: "cost_cap" });
  });

  it("a plan with no parseable cost executes (cost 0)", async () => {
    const db = new StubDb([
      { match: /^EXPLAIN /, result: { rows: [{ "QUERY PLAN": "Result" }] } },
      { match: /FROM refundlens/, result: { rows: [] } },
    ]);
    await expect(runFenced(db, GOOD, [])).resolves.toMatchObject({ rows: [] });
  });
});
