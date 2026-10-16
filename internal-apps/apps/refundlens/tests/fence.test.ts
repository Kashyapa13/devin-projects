import { describe, expect, it } from "vitest";
import { FencedRejection, validateSql, type FenceReason } from "../api/src/ask/fence.js";

/**
 * The fence table-driven unit gate (AGENTS.md §7): every banned construct
 * rejected — mutation, DDL, cross-schema, no-LIMIT, over-cap, banned
 * tables — plus spelling variants the AST (not regex) must still catch.
 */
const CASES: { sql: string; reason: FenceReason; label: string }[] = [
  // mutations & DDL
  { label: "DELETE", sql: "DELETE FROM refundlens.agg_daily WHERE true", reason: "mutation" },
  { label: "UPDATE", sql: "UPDATE refundlens.agg_daily SET cnt = 0", reason: "mutation" },
  { label: "INSERT", sql: "INSERT INTO refundlens.agg_daily VALUES (1,'x','y','z',1,1,1,1)", reason: "mutation" },
  { label: "DROP", sql: "DROP TABLE refundlens.agg_daily", reason: "mutation" },
  { label: "CREATE", sql: "CREATE TABLE refundlens.evil (id int)", reason: "mutation" },
  { label: "ALTER", sql: "ALTER TABLE refundlens.agg_daily ADD COLUMN x int", reason: "mutation" },
  { label: "TRUNCATE", sql: "TRUNCATE refundlens.agg_daily", reason: "mutation" },
  { label: "GRANT", sql: "GRANT ALL ON refundlens.agg_daily TO public", reason: "mutation" },
  { label: "SELECT INTO write", sql: "SELECT cnt INTO tmp FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },
  { label: "stacked second statement", sql: "SELECT day FROM refundlens.agg_daily LIMIT 1; DROP TABLE refundlens.agg_daily", reason: "mutation" },
  { label: "CTE hiding a write", sql: "WITH x AS (DELETE FROM refundlens.agg_daily RETURNING *) SELECT * FROM x LIMIT 1", reason: "mutation" },
  // cross-schema / off-allowlist
  { label: "public schema", sql: "SELECT * FROM public.users LIMIT 1", reason: "cross_schema" },
  { label: "pg_catalog", sql: "SELECT * FROM pg_catalog.pg_roles LIMIT 1", reason: "cross_schema" },
  { label: "unallowlisted table in schema", sql: "SELECT * FROM refundlens.secret_stash LIMIT 1", reason: "cross_schema" },
  // banned tables — evidence surfaces are never queryable
  { label: "ask_log banned", sql: "SELECT * FROM refundlens.ask_log LIMIT 1", reason: "banned_table" },
  { label: "ask_log unqualified", sql: "SELECT * FROM ask_log LIMIT 1", reason: "banned_table" },
  { label: "ask_log quoted identifier", sql: 'SELECT * FROM "ask_log" LIMIT 1', reason: "banned_table" },
  { label: "sync_runs banned", sql: "SELECT * FROM refundlens.sync_runs LIMIT 1", reason: "banned_table" },
  { label: "banned table via JOIN", sql: "SELECT a.day FROM refundlens.agg_daily a JOIN refundlens.sync_runs s ON true LIMIT 1", reason: "banned_table" },
  // limit law
  { label: "no LIMIT", sql: "SELECT day FROM refundlens.agg_daily", reason: "no_limit" },
  { label: "LIMIT over cap", sql: "SELECT day FROM refundlens.agg_daily LIMIT 5001", reason: "limit_over_cap" },
  { label: "LIMIT way over cap", sql: "SELECT day FROM refundlens.agg_daily LIMIT 100000", reason: "limit_over_cap" },
  // non-SELECT / unparseable
  { label: "EXPLAIN statement", sql: "EXPLAIN SELECT * FROM refundlens.agg_daily", reason: "non_select" },
  { label: "SET statement", sql: "SET statement_timeout = 0", reason: "mutation" },
  { label: "gibberish", sql: "@@@ not sql @@@", reason: "non_select" },
  { label: "unterminated literal", sql: "SELECT day FROM refundlens.agg_daily WHERE day = 'x LIMIT 1", reason: "parse_failure" },
];

describe("the fence — table-driven banned constructs (§7 unit gate)", () => {
  for (const c of CASES) {
    it(`rejects ${c.label}`, () => {
      try {
        validateSql(c.sql);
        expect.unreachable(`expected FencedRejection for ${c.label}`);
      } catch (e) {
        expect(e).toBeInstanceOf(FencedRejection);
        expect((e as FencedRejection).reason).toBe(c.reason);
        expect((e as FencedRejection).guidance.length).toBeGreaterThan(0);
      }
    });
  }

  it("accepts allowlisted aggregate SQL (the shape templates emit)", () => {
    const ast = validateSql(
      "SELECT channel, SUM(cnt)::bigint AS value FROM agg_daily WHERE day BETWEEN $1 AND $2 GROUP BY channel ORDER BY channel LIMIT 500",
    );
    expect(ast.kind).toBe("select");
  });

  it("accepts schema-qualified allowlisted tables", () => {
    const ast = validateSql(
      "SELECT day, cnt FROM refundlens.agg_daily WHERE day > $1 ORDER BY day LIMIT 5000",
    );
    expect(ast.kind).toBe("select");
    if (ast.kind === "select") expect(ast.limit).toBe(5000);
  });

  it("accepts LIMIT at exactly the cap", () => {
    expect(
      validateSql("SELECT day FROM refundlens.agg_daily LIMIT 5000").kind,
    ).toBe("select");
  });

  it("rejects banned functions hiding inside a SELECT expression", () => {
    try {
      validateSql("SELECT set_config('statement_timeout','0',false) FROM refundlens.agg_daily LIMIT 1");
      expect.unreachable();
    } catch (e) {
      expect((e as FencedRejection).reason).toBe("mutation");
    }
  });
});
