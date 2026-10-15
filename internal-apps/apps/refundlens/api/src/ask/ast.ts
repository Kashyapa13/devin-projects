/**
 * Minimal SQL AST for the fence (LLD §fence — "AST validation, not regex").
 * We lex + parse into a tree and validate the TREE — spelling tricks,
 * comments, quoting and case cannot evade a structural check.
 *
 * Grammar covered (the only grammar our own generator emits, plus the
 * hostile shapes the fence must catch):
 *   SELECT <exprs> FROM <refs> [JOIN ... ON ...] [WHERE ...]
 *     [GROUP BY ...] [HAVING ...] [ORDER BY ...] [LIMIT n] [OFFSET n]
 * Anything else — mutation, DDL, multi-statement, CTE writes — parses
 * into Statement { kind: 'mutation' | 'other' } for the fence to reject.
 */

export type TokenKind =
  | "word"
  | "number"
  | "string"
  | "param"
  | "op"
  | "comma"
  | "lparen"
  | "rparen"
  | "semi"
  | "eof";

export interface Token {
  kind: TokenKind;
  /** normalized: unquoted-case-folded, quotes stripped */
  text: string;
  raw: string;
}

export interface TableRef {
  schema: string | null;
  table: string;
}

export interface SelectAst {
  kind: "select";
  tables: TableRef[];
  limit: number | null;
  /** normalized keyword stream of the whole statement (for verb scans) */
  verbs: string[];
}

export interface OtherAst {
  kind: "mutation" | "other" | "empty";
  verbs: string[];
}

export type Ast = SelectAst | OtherAst;

const KEYWORDS = new Set([
  "select", "from", "where", "group", "by", "having", "order", "limit",
  "offset", "join", "inner", "left", "right", "full", "cross", "on",
  "as", "and", "or", "not", "in", "is", "null", "between", "like",
  "asc", "desc", "distinct", "union", "all", "with", "case", "when",
  "then", "else", "end", "exists",
]);

/** Words that begin a non-SELECT statement, signal a write/DDL verb, or
 * smuggle unchecked SQL (INTO writes; UNION/INTERSECT/EXCEPT append a
 * second, fence-unchecked SELECT — our grammar has no set-ops). */
export const NON_SELECT_VERBS = new Set([
  "insert", "update", "delete", "drop", "create", "alter", "truncate",
  "grant", "revoke", "merge", "call", "execute", "copy", "vacuum",
  "comment", "security", "do", "set", "reset", "show", "listen",
  "notify", "unlisten", "lock", "begin", "commit", "rollback",
  "savepoint", "prepare", "deallocate", "declare", "fetch", "move",
  "close", "reindex", "cluster", "refresh", "discard", "analyze",
  "into", "union", "intersect", "except",
]);

/** Words banned inside any expression (write-capable function/verb). */
export const BANNED_EXPR_WORDS = new Set([
  "pg_terminate_backend", "pg_cancel_backend", "set_config",
  "dblink_exec", "dblink", "lo_import", "lo_export",
]);

export function lex(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f") {
      i++;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) throw new Error("unterminated comment");
      i = end + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n && sql[j] !== "'") {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else j++;
      }
      if (j >= n) throw new Error("unterminated string literal");
      out.push({ kind: "string", text: sql.slice(i + 1, j).replace(/''/g, "'"), raw: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      if (j === -1) throw new Error("unterminated quoted identifier");
      out.push({ kind: "word", text: sql.slice(i + 1, j), raw: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (c === "$") {
      let j = i + 1;
      while (j < n && /\d/.test(sql[j]!)) j++;
      if (j > i + 1) {
        out.push({ kind: "param", text: sql.slice(i, j), raw: sql.slice(i, j) });
        i = j;
        continue;
      }
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9._eE+-]/.test(sql[j]!)) j++;
      out.push({ kind: "number", text: sql.slice(i, j), raw: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(sql[j]!)) j++;
      const raw = sql.slice(i, j);
      out.push({ kind: "word", text: raw.toLowerCase(), raw });
      i = j;
      continue;
    }
    if (c === ",") { out.push({ kind: "comma", text: ",", raw: "," }); i++; continue; }
    if (c === "(") { out.push({ kind: "lparen", text: "(", raw: "(" }); i++; continue; }
    if (c === ")") { out.push({ kind: "rparen", text: ")", raw: ")" }); i++; continue; }
    if (c === ";") { out.push({ kind: "semi", text: ";", raw: ";" }); i++; continue; }
    out.push({ kind: "op", text: c, raw: c });
    i++;
  }
  out.push({ kind: "eof", text: "", raw: "" });
  return out;
}

class Parser {
  pos = 0;
  constructor(private toks: Token[]) {}
  peek(): Token { return this.toks[this.pos]!; }
  next(): Token { return this.toks[this.pos++]!; }
  is(text: string): boolean {
    const t = this.peek();
    return t.kind === "word" && t.text === text;
  }
  isKind(kind: TokenKind): boolean { return this.peek().kind === kind; }
  expect(text: string): void {
    if (!this.is(text)) throw new Error(`expected ${text}, got ${this.peek().raw}`);
    this.next();
  }

  /** Parse one qualified name: [schema.]table — returns null if not a name. */
  tableRef(): TableRef | null {
    const t = this.peek();
    if (t.kind !== "word" || KEYWORDS.has(t.text)) return null;
    const first = this.next().text;
    if (this.peek().text === "." && this.toks[this.pos + 1]?.kind === "word") {
      this.next(); // dot
      return { schema: first, table: this.next().text };
    }
    return { schema: null, table: first };
  }

  /** Skip a balanced expression until one of the boundary keywords/commas at
   * depth 0, collecting words and recursively validating any parenthesized
   * SELECT (its tables + verbs merge into the caller's AST — OPEN-2). */
  skipExpr(ast: SelectAst, stopWords: Set<string>, stopComma: boolean): void {
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.kind === "eof") return;
      if (t.kind === "semi") return;
      if (depth === 0 && stopComma && t.kind === "comma") return;
      if (depth === 0 && t.kind === "word" && stopWords.has(t.text)) return;
      if (t.kind === "lparen") {
        this.next();
        const inner = this.peek();
        if (inner.kind === "word" && inner.text === "select") {
          // a parenthesized SELECT is a nested query — parse it so its
          // tables and verbs face the same fences as the outer statement
          this.next();
          const sub: SelectAst = { kind: "select", tables: [], limit: null, verbs: [] };
          this.parseSelect(sub);
          ast.tables.push(...sub.tables);
          ast.verbs.push(...sub.verbs);
          if (this.isKind("rparen")) this.next(); // consume the subquery's close
          continue;
        }
        depth++;
        continue;
      }
      if (t.kind === "rparen") {
        if (depth === 0) return; // our own boundary inside a subquery
        depth--;
      }
      if (t.kind === "word" || t.kind === "string") ast.verbs.push(t.text);
      this.next();
    }
  }

  parseSelect(ast: SelectAst): void {
    // SELECT <exprs> — boundary FROM at depth 0; commas separate items,
    // they are not clause boundaries. Collected as verbs so write-capable
    // words in the SELECT list (INTO, set_config, ...) reach the fence.
    this.skipExpr(ast, new Set(["from"]), false);
    if (!this.is("from")) throw new Error("SELECT without FROM");
    this.expect("from");
    for (;;) {
      // JOIN chain — checked first each iteration so a second+ JOIN is
      // recorded, not dropped into the straggler tail (OPEN-2)
      if (["join", "inner", "left", "right", "full", "cross"].includes(this.peek().text)) {
        this.next();
        if (this.is("join") || this.is("outer")) this.next();
        if (this.is("join")) this.next();
        const jref = this.tableRef();
        if (!jref) throw new Error("JOIN without table");
        ast.tables.push(jref);
        if (this.is("as")) { this.next(); this.next(); }
        else if (this.peek().kind === "word" && !KEYWORDS.has(this.peek().text)) this.next();
        if (this.is("on")) {
          this.next();
          this.skipExpr(ast, new Set(["join", "inner", "left", "right", "full", "cross", "where", "group", "order", "having", "limit", "offset"]), true);
        }
        continue;
      }
      const ref = this.tableRef();
      if (!ref) {
        if (this.isKind("lparen")) throw new Error("subqueries are not allowed by the fence");
        break;
      }
      ast.tables.push(ref);
      // optional alias
      if (this.is("as")) { this.next(); this.next(); }
      else if (this.peek().kind === "word" && !KEYWORDS.has(this.peek().text)) this.next();
      if (this.isKind("comma")) { this.next(); continue; }
      // loop top re-checks for a JOIN chain
    }
    // tail clauses
    for (;;) {
      const t = this.peek();
      if (t.kind === "eof" || t.kind === "semi") return;
      // rparen means we are inside a subquery — leave it for the caller
      if (t.kind === "rparen") return;
      if (this.is("where")) {
        this.next();
        this.skipExpr(ast, new Set(["group", "order", "having", "limit", "offset"]), false);
        continue;
      }
      if (this.is("group")) {
        this.next(); this.expect("by");
        this.skipExpr(ast, new Set(["having", "order", "limit", "offset"]), false);
        continue;
      }
      if (this.is("having")) {
        this.next();
        this.skipExpr(ast, new Set(["order", "limit", "offset"]), false);
        continue;
      }
      if (this.is("order")) {
        this.next(); this.expect("by");
        this.skipExpr(ast, new Set(["limit", "offset"]), false);
        continue;
      }
      if (this.is("limit")) {
        this.next();
        const v = this.next();
        if (v.kind === "number") ast.limit = Math.floor(Number(v.text));
        else if (v.text === "all") ast.limit = null;
        else throw new Error("non-literal LIMIT");
        continue;
      }
      if (this.is("offset")) {
        this.next(); this.next();
        continue;
      }
      // stragglers — absorb as verbs (aliases, ASC/DESC leftovers)
      ast.verbs.push(t.text);
      this.next();
    }
  }
}

/** Parse SQL into an AST. Throws on unlexable input; callers treat as rejection. */
export function parseSql(sql: string): Ast {
  const toks = lex(sql);
  const p = new Parser(toks);
  const first = p.peek();
  if (first.kind === "eof") return { kind: "empty", verbs: [] };

  if (first.kind === "word" && first.text === "select") {
    const ast: SelectAst = { kind: "select", tables: [], limit: null, verbs: [] };
    p.next();
    // SELECT INTO is a write — catch it structurally
    if (p.is("into")) return { kind: "mutation", verbs: ["select", "into"] };
    p.parseSelect(ast);
    // trailing junk / second statement
    if (p.isKind("semi")) {
      p.next();
      if (p.peek().kind !== "eof") {
        const rest = p.next();
        return { kind: "mutation", verbs: ["select", ";", rest.text] };
      }
    }
    if (p.peek().kind !== "eof" && p.peek().kind !== "semi") {
      // e.g. UNION — treat set-ops as still-select but note the verb
      while (p.peek().kind !== "eof") ast.verbs.push(p.next().text);
    }
    return ast;
  }

  // WITH ... could hide a data-modifying CTE — scan it, don't trust it
  const verbs = toks.filter((t) => t.kind === "word").map((t) => t.text);
  const firstWord = first.text;
  if (NON_SELECT_VERBS.has(firstWord)) return { kind: "mutation", verbs };
  return { kind: "other", verbs };
}
