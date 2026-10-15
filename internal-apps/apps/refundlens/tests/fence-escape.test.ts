import { describe, expect, it } from "vitest";
import {
  FencedRejection,
  validateSql,
  type FenceReason,
} from "../api/src/ask/fence.js";
import { generate } from "../api/src/ask/nl.js";

/**
 * THE ATTEMPTED-ESCAPE CORPUS (TESTING.md §SECURITY — the fence is the
 * crown jewel): ≥20 banned statements incl. injection payloads. Every
 * entry must end in a FencedRejection carrying reason + guidance — the
 * API surfaces it as error.code = "fenced_query_rejected", never a best
 * effort. Entries marked it.fails are CONFIRMED escapes (OPEN-2): the
 * AST validates top-level FROM/JOIN refs only, so parenthesized
 * subqueries reach the DB unchecked. They fail loudly here until the
 * fence closes them.
 */

const CORPUS: { label: string; sql: string; reason: FenceReason }[] = [
  // ── write verbs & DDL ────────────────────────────────────────────
  { label: "DELETE", sql: "DELETE FROM refundlens.agg_daily", reason: "mutation" },
  { label: "UPDATE", sql: "UPDATE refundlens.agg_daily SET cnt=0", reason: "mutation" },
  { label: "INSERT", sql: "INSERT INTO refundlens.agg_daily (day) VALUES ('2026-01-01')", reason: "mutation" },
  { label: "MERGE", sql: "MERGE INTO refundlens.agg_daily USING x ON true", reason: "mutation" },
  { label: "DROP", sql: "DROP TABLE refundlens.agg_daily CASCADE", reason: "mutation" },
  { label: "CREATE", sql: "CREATE TABLE refundlens.evil (id int)", reason: "mutation" },
  { label: "ALTER", sql: "ALTER TABLE refundlens.agg_daily ADD COLUMN x int", reason: "mutation" },
  { label: "TRUNCATE", sql: "TRUNCATE TABLE refundlens.agg_daily", reason: "mutation" },
  { label: "GRANT", sql: "GRANT SELECT ON refundlens.agg_daily TO public", reason: "mutation" },
  { label: "REVOKE", sql: "REVOKE SELECT ON refundlens.agg_daily FROM app", reason: "mutation" },
  { label: "COPY out (exfil)", sql: "COPY refundlens.agg_daily TO '/tmp/x'", reason: "mutation" },
  { label: "COPY in (load)", sql: "COPY refundlens.agg_daily FROM '/etc/passwd'", reason: "mutation" },
  { label: "DO block", sql: "DO $$ BEGIN RAISE NOTICE 'x'; END $$", reason: "mutation" },
  { label: "CALL proc", sql: "CALL evil_proc()", reason: "mutation" },
  { label: "SET session", sql: "SET statement_timeout = 0", reason: "mutation" },
  { label: "BEGIN tx", sql: "BEGIN; DELETE FROM refundlens.agg_daily; COMMIT", reason: "mutation" },
  { label: "LISTEN/NOTIFY", sql: "NOTIFY chan, 'payload'", reason: "mutation" },
  { label: "PREPARE/EXECUTE", sql: "PREPARE x AS DELETE FROM refundlens.agg_daily", reason: "mutation" },
  { label: "SELECT INTO", sql: "SELECT cnt INTO tmp FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },
  { label: "stacked statement", sql: "SELECT day FROM refundlens.agg_daily LIMIT 1; DROP TABLE refundlens.agg_daily", reason: "mutation" },
  { label: "write hidden in CTE", sql: "WITH x AS (DELETE FROM refundlens.agg_daily RETURNING *) SELECT * FROM x LIMIT 1", reason: "mutation" },

  // ── injection payloads (classic shapes) ──────────────────────────
  { label: "UNION smuggle", sql: "SELECT day FROM refundlens.agg_daily LIMIT 1 UNION SELECT password FROM public.users", reason: "mutation" },
  { label: "INTERSECT smuggle", sql: "SELECT day FROM refundlens.agg_daily LIMIT 1 INTERSECT SELECT 1", reason: "mutation" },
  { label: "EXCEPT smuggle", sql: "SELECT day FROM refundlens.agg_daily LIMIT 1 EXCEPT SELECT 1", reason: "mutation" },
  { label: "comment-smuggled drop", sql: "SELECT day FROM refundlens.agg_daily LIMIT 1; -- trailing\nDROP TABLE refundlens.agg_daily", reason: "mutation" },
  { label: "write-capable function in SELECT", sql: "SELECT set_config('statement_timeout','0',false) FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },
  { label: "pg_terminate_backend", sql: "SELECT pg_terminate_backend(pid) FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },
  { label: "dblink exec", sql: "SELECT dblink_exec('x','DROP TABLE y') FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },
  { label: "lo_export exfil", sql: "SELECT lo_export(1,'/tmp/x') FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },
  { label: "INTO smuggled in SELECT list", sql: "SELECT day INTO outfile FROM refundlens.agg_daily LIMIT 1", reason: "mutation" },

  // ── schema / evidence-table escapes ──────────────────────────────
  { label: "pg_catalog", sql: "SELECT * FROM pg_catalog.pg_roles LIMIT 1", reason: "cross_schema" },
  { label: "information_schema", sql: "SELECT * FROM information_schema.tables LIMIT 1", reason: "cross_schema" },
  { label: "public schema", sql: "SELECT * FROM public.users LIMIT 1", reason: "cross_schema" },
  { label: "off-allowlist in-schema table", sql: "SELECT * FROM refundlens.monitors LIMIT 1", reason: "cross_schema" },
  { label: "ask_log evidence", sql: "SELECT * FROM refundlens.ask_log LIMIT 1", reason: "banned_table" },
  { label: "ask_log unqualified", sql: "SELECT * FROM ask_log LIMIT 1", reason: "banned_table" },
  { label: "ask_log via JOIN", sql: "SELECT a.day FROM refundlens.agg_daily a JOIN ask_log l ON true LIMIT 1", reason: "banned_table" },
  { label: "sync_runs internals", sql: "SELECT * FROM refundlens.sync_runs LIMIT 1", reason: "banned_table" },
  { label: "sync_runs quoted", sql: 'SELECT * FROM "sync_runs" LIMIT 1', reason: "banned_table" },

  // ── LIMIT law ────────────────────────────────────────────────────
  { label: "no LIMIT", sql: "SELECT day FROM refundlens.agg_daily", reason: "no_limit" },
  { label: "LIMIT ALL", sql: "SELECT day FROM refundlens.agg_daily LIMIT ALL", reason: "no_limit" },
  { label: "LIMIT over cap", sql: "SELECT day FROM refundlens.agg_daily LIMIT 5001", reason: "limit_over_cap" },
  { label: "LIMIT way over cap", sql: "SELECT day FROM refundlens.agg_daily LIMIT 99999999", reason: "limit_over_cap" },
  { label: "non-literal LIMIT", sql: "SELECT day FROM refundlens.agg_daily LIMIT (SELECT 1)", reason: "parse_failure" },

  // ── non-SELECT / unlexable ───────────────────────────────────────
  { label: "EXPLAIN statement", sql: "EXPLAIN SELECT * FROM refundlens.agg_daily", reason: "non_select" },
  { label: "VACUUM ANALYZE", sql: "VACUUM ANALYZE refundlens.agg_daily", reason: "mutation" },
  { label: "unterminated literal", sql: "SELECT day FROM refundlens.agg_daily WHERE day='x", reason: "parse_failure" },
];

/** CONFIRMED escapes (P1 — OPEN-2): parenthesized subqueries are never
 * AST-validated, so fences #2/#6 don't hold below top level. it.fails
 * flips green the day the fence closes them. */
const CONFIRMED_ESCAPES: { label: string; sql: string }[] = [
  { label: "scalar subquery reads pg_roles", sql: "SELECT (SELECT rolname FROM pg_roles LIMIT 1) AS x FROM refundlens.agg_daily LIMIT 1" },
  { label: "EXISTS subquery reads ask_log", sql: "SELECT day FROM refundlens.agg_daily WHERE EXISTS (SELECT 1 FROM refundlens.ask_log) LIMIT 1" },
  { label: "IN subquery reads ask_log", sql: "SELECT day FROM refundlens.agg_daily WHERE day IN (SELECT day FROM refundlens.ask_log) LIMIT 1" },
  { label: "scalar subquery calls version()", sql: "SELECT day, (SELECT version()) FROM refundlens.agg_daily LIMIT 1" },
  { label: "HAVING subquery reads ask_log", sql: "SELECT day FROM refundlens.agg_daily GROUP BY day HAVING EXISTS (SELECT 1 FROM refundlens.ask_log) LIMIT 1" },
  { label: "correlated subquery reads sync_runs", sql: "SELECT day FROM refundlens.agg_daily WHERE day = (SELECT max(created_at) FROM refundlens.sync_runs) LIMIT 5" },
  // OPEN-2b: second+ JOIN targets land in verbs, not ast.tables — the
  // schema allowlist never sees them (first JOIN is caught correctly).
  { label: "second JOIN reaches pg_catalog", sql: "SELECT a.day FROM refundlens.agg_daily a JOIN refundlens.agg_daily b ON a.day=b.day JOIN pg_catalog.pg_roles c ON true LIMIT 1" },
];

describe("attempted-escape corpus — every banned construct is fenced", () => {
  for (const c of CORPUS) {
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

  for (const c of CONFIRMED_ESCAPES) {
    it.fails(`rejects ${c.label} (OPEN-2 — confirmed escape, unfixed)`, () => {
      expect(() => validateSql(c.sql)).toThrowError(FencedRejection);
    });
  }

  it("the corpus never produces a non-FencedRejection error type", () => {
    for (const c of [...CORPUS, ...CONFIRMED_ESCAPES]) {
      try {
        validateSql(c.sql);
      } catch (e) {
        expect(e, c.label).toBeInstanceOf(FencedRejection);
      }
    }
  });
});

describe("NL layer — hostile questions can only emit fenced rejections", () => {
  const HOSTILE_QUESTIONS = [
    "delete all refunds",
    "drop the agg table",
    "update every row",
    "truncate refund events",
    "show me the ask log",
    "what did other analysts ask",
    "show me the sync runs",
    "list all users and passwords",
    "give me customer cards",
    "dump the pan numbers",
    "show secrets and tokens",
  ];
  for (const q of HOSTILE_QUESTIONS) {
    it(`"${q}" → emitted SQL is fenced`, () => {
      const gen = generate(q, new Date("2026-10-15T00:00:00Z"));
      expect(() => validateSql(gen.query.sql)).toThrowError(FencedRejection);
    });
  }
});
