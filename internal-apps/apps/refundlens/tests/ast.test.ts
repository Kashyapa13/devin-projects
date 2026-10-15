import { describe, expect, it } from "vitest";
import { lex, parseSql } from "../api/src/ask/ast.js";

/**
 * AST lexer/parser edge coverage — the fence's contract is "AST, not
 * regex", so the parser itself gets the boundary treatment: comments,
 * quoting, literal escapes, clause tails, aliases, JOIN shapes, and
 * everything that must parse as non-select.
 */

describe("lex — tokenization edges", () => {
  it("strips line and block comments entirely", () => {
    const toks = lex("SELECT -- hidden\n a /* mid */ FROM b LIMIT 1");
    expect(toks.map((t) => t.text)).toEqual(["select", "a", "from", "b", "limit", "1", ""]);
  });

  it("strips a comment glued inside a clause boundary", () => {
    const toks = lex("SELECT a FROM/**/refundlens.agg_daily LIMIT 1");
    expect(toks.filter((t) => t.kind === "word").map((t) => t.text)).toEqual(
      ["select", "a", "from", "refundlens", "agg_daily", "limit"],
    );
  });

  it("a -- comment consumes the rest of the line (fail-closed: trailing LIMIT is lost → fence rejects)", () => {
    const toks = lex("SELECT a--c FROM t LIMIT 1");
    expect(toks.map((t) => t.text)).toEqual(["select", "a", ""]);
  });

  it("throws on an unterminated block comment", () => {
    expect(() => lex("SELECT /* never ends")).toThrow(/unterminated comment/);
  });

  it("doubled quotes split into adjacent string tokens (P2 lexer quirk — never loses verb info)", () => {
    // SQL's '' escape should collapse to ONE literal 'it's'; the lexer
    // emits two adjacent string tokens instead. Fail-closed: the split
    // only affects literal TEXT, never lets a word masquerade as a verb.
    const toks = lex("SELECT 'it''s' FROM t");
    const strings = toks.filter((t) => t.kind === "string").map((t) => t.text);
    expect(strings).toEqual(["it", "s"]);
  });

  it("throws on an unterminated string literal", () => {
    expect(() => lex("SELECT 'oops FROM t")).toThrow(/unterminated string/);
  });

  it("treats double-quoted identifiers as words without case-folding", () => {
    const toks = lex('SELECT a FROM "Ask_Log" LIMIT 1');
    expect(toks.find((t) => t.raw === '"Ask_Log"')?.text).toBe("Ask_Log");
  });

  it("throws on an unterminated quoted identifier", () => {
    expect(() => lex('SELECT a FROM "oops LIMIT 1')).toThrow(/unterminated quoted/);
  });

  it("lexes $N bind params and bare operators", () => {
    const toks = lex("SELECT a FROM t WHERE x = $12 AND y <> 'z'");
    expect(toks.find((t) => t.kind === "param")?.text).toBe("$12");
    expect(toks.some((t) => t.kind === "op" && t.text === "<")).toBe(true);
  });

  it("a bare $ is an operator, not a param", () => {
    const toks = lex("SELECT a FROM t WHERE x = $ LIMIT 1");
    expect(toks.find((t) => t.text === "$")?.kind).toBe("op");
  });

  it("number forms: decimals, exponent, leading dot", () => {
    const toks = lex("LIMIT 2.5e3");
    expect(toks.find((t) => t.kind === "number")?.text).toBe("2.5e3");
    const dot = lex("LIMIT .5");
    expect(dot.find((t) => t.kind === "number")?.text).toBe(".5");
  });
});

describe("parseSql — statement shapes", () => {
  it("empty input parses as kind empty", () => {
    expect(parseSql("   ").kind).toBe("empty");
    expect(parseSql("-- nothing\n").kind).toBe("empty");
  });

  it("SELECT INTO parses as select but records 'into' in verbs for the fence", () => {
    const ast = parseSql("SELECT cnt INTO tmp FROM refundlens.agg_daily LIMIT 1");
    expect(ast.kind).toBe("select");
    if (ast.kind === "select") expect(ast.verbs).toContain("into");
  });

  it("a second statement after a semicolon flips the parse to mutation", () => {
    const ast = parseSql("SELECT day FROM refundlens.agg_daily LIMIT 1; SELECT 1");
    expect(ast.kind).toBe("mutation");
  });

  it("a trailing semicolon alone is legal", () => {
    const ast = parseSql("SELECT day FROM refundlens.agg_daily LIMIT 1;");
    expect(ast.kind).toBe("select");
  });

  it("a trailing UNION is recorded as a verb for the fence to reject", () => {
    const ast = parseSql(
      "SELECT day FROM refundlens.agg_daily LIMIT 1 UNION SELECT x FROM y",
    );
    expect(ast.kind).toBe("select");
    if (ast.kind === "select") expect(ast.verbs).toContain("union");
  });

  it("non-SELECT first verbs classify as mutation", () => {
    expect(parseSql("DELETE FROM refundlens.agg_daily").kind).toBe("mutation");
    expect(parseSql("SET statement_timeout=0").kind).toBe("mutation");
    expect(parseSql("VACUUM refundlens.agg_daily").kind).toBe("mutation");
  });

  it("WITH-led and other shapes classify as other (non-select)", () => {
    expect(parseSql("WITH x AS (SELECT 1) SELECT * FROM x").kind).toBe("other");
    expect(parseSql("EXPLAIN SELECT 1").kind).toBe("other");
    expect(parseSql("@@@ nonsense").kind).toBe("other");
  });
});

describe("parseSelect — clause tail coverage", () => {
  const tables = (sql: string) => {
    const ast = parseSql(sql);
    if (ast.kind !== "select") throw new Error(`expected select, got ${ast.kind}`);
    return ast;
  };

  it("captures multiple FROM refs and aliases (AS and bare)", () => {
    const ast = tables(
      "SELECT a.day FROM refundlens.agg_daily AS a, refundlens.agg_daily b LIMIT 1",
    );
    expect(ast.tables).toEqual([
      { schema: "refundlens", table: "agg_daily" },
      { schema: "refundlens", table: "agg_daily" },
    ]);
  });

  it("captures EVERY JOIN ref as a table — OPEN-2 closed (c1a55e8)", () => {
    const ast = tables(
      "SELECT a.day FROM refundlens.agg_daily a " +
        "LEFT OUTER JOIN refundlens.refund_events_raw r ON r.channel = a.channel " +
        "JOIN refundlens.agg_daily a2 ON a2.day = a.day LIMIT 1",
    );
    // Every JOIN target lands in ast.tables now — schema/banned checks
    // see each ref (was: 2nd+ JOIN landed in verbs — the OPEN-2 escape).
    expect(ast.tables.map((t) => t.table)).toEqual([
      "agg_daily",
      "refund_events_raw",
      "agg_daily",
    ]);
  });

  it("JOIN without a table is a parse failure", () => {
    expect(() =>
      tables("SELECT a.day FROM refundlens.agg_daily a JOIN LIMIT 1"),
    ).toThrow(/JOIN without table/);
  });

  it("a subquery in FROM is refused by construction", () => {
    expect(() =>
      tables("SELECT x FROM (SELECT day FROM refundlens.agg_daily) s LIMIT 1"),
    ).toThrow(/subqueries are not allowed/);
  });

  it("SELECT without FROM is a parse failure", () => {
    expect(() => tables("SELECT 1")).toThrow(/SELECT without FROM/);
  });

  it("LIMIT captures the literal; LIMIT ALL means no limit", () => {
    expect(tables("SELECT day FROM refundlens.agg_daily LIMIT 5000").limit).toBe(5000);
    expect(tables("SELECT day FROM refundlens.agg_daily LIMIT all").limit).toBeNull();
  });

  it("non-literal LIMIT is a parse failure", () => {
    expect(() =>
      tables("SELECT day FROM refundlens.agg_daily LIMIT x"),
    ).toThrow(/non-literal LIMIT/);
  });

  it("WHERE/GROUP BY/HAVING/ORDER BY/OFFSET tails parse and verbs collect", () => {
    const ast = tables(
      "SELECT day, SUM(cnt) FROM refundlens.agg_daily " +
        "WHERE day BETWEEN $1 AND $2 GROUP BY day HAVING SUM(cnt) > $3 " +
        "ORDER BY day DESC LIMIT 10 OFFSET 5",
    );
    expect(ast.limit).toBe(10);
    expect(ast.verbs.join(" ")).toContain("between");
  });

  it("expression tokens in WHERE become verbs the fence can scan", () => {
    const ast = tables(
      "SELECT day FROM refundlens.agg_daily WHERE set_config('x','y',false) = '' LIMIT 1",
    );
    expect(ast.verbs).toContain("set_config");
  });
});
