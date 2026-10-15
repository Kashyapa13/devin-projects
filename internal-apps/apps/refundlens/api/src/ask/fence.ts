import {
  BANNED_EXPR_WORDS,
  NON_SELECT_VERBS,
  parseSql,
  type Ast,
  type SelectAst,
} from "./ast.js";

/**
 * The six fences + AST validation (LLD §fence — implement exactly).
 * Every rejection is a FencedRejection carrying a stable `reason` label
 * (metered as refundlens_fence_rejected_total{reason}) and user-facing
 * `guidance` — never a silent best-effort.
 */

export type FenceReason =
  | "mutation"
  | "non_select"
  | "cross_schema"
  | "banned_table"
  | "no_limit"
  | "limit_over_cap"
  | "cost_cap"
  | "parse_failure"
  | "timeout";

export class FencedRejection extends Error {
  constructor(
    public readonly reason: FenceReason,
    message: string,
    public readonly guidance: string,
  ) {
    super(message);
    this.name = "FencedRejection";
  }
}

/** Fence #6 — evidence tables are never queryable by generated SQL. */
export const BANNED_TABLES = ["ask_log", "sync_runs"] as const;
/** Fence #2 — generated SQL may only read inside this schema, from these. */
export const SCHEMA_ALLOWLIST = "refundlens";
export const TABLE_ALLOWLIST = ["refund_events_raw", "agg_daily"] as const;
/** Fence #3 — every statement carries a LIMIT ≤ cap. */
export const LIMIT_DEFAULT = 500;
export const LIMIT_MAX = 5000;
/** Fence #5 — EXPLAIN total cost above this is rejected with guidance. */
export const COST_CAP = 5000;

const VERB_IN_VERBS = (verbs: string[], set: Set<string>): string | null =>
  verbs.find((v) => set.has(v)) ?? null;

/** AST validation of generated SQL — throws FencedRejection on any violation. */
export function validateSql(sql: string): SelectAst {
  let ast: Ast;
  try {
    ast = parseSql(sql);
  } catch (e) {
    throw new FencedRejection(
      "parse_failure",
      `could not parse the generated query safely: ${(e as Error).message}`,
      "rephrase the question in terms of refund counts, amounts, channels, segments or reasons",
    );
  }

  if (ast.kind !== "select") {
    const verb = VERB_IN_VERBS(ast.verbs, NON_SELECT_VERBS);
    const mutation = ast.kind === "mutation" || verb !== null;
    throw new FencedRejection(
      mutation ? "mutation" : "non_select",
      mutation
        ? verb
          ? `statement contains a write verb (${verb})`
          : "the generated query is not read-only"
        : "only single-statement SELECT is allowed",
      mutation
        ? "RefundLens is read-only — ask a question about the data instead of changing it"
        : "ask for a number, a breakdown, or a list of refund events",
    );
  }

  // fence #2/#6 — every FROM/JOIN ref must be an allowlisted table in the
  // allowlisted schema (unqualified resolves to the bound search_path).
  for (const t of ast.tables) {
    if (t.schema !== null && t.schema !== SCHEMA_ALLOWLIST) {
      throw new FencedRejection(
        "cross_schema",
        `query reaches outside the refundlens schema (${t.schema}.${t.table})`,
        "only refund events and daily aggregates are queryable",
      );
    }
    if ((BANNED_TABLES as readonly string[]).includes(t.table)) {
      throw new FencedRejection(
        "banned_table",
        `table ${t.table} is not queryable through the ask box`,
        "usage history and sync internals are not data you can ask about",
      );
    }
    if (!(TABLE_ALLOWLIST as readonly string[]).includes(t.table)) {
      throw new FencedRejection(
        "cross_schema",
        `table ${t.table} is outside the allowlist`,
        "only refund_events_raw and agg_daily are queryable",
      );
    }
  }

  // banned write-capable words anywhere in the statement's expressions
  const bad = VERB_IN_VERBS(ast.verbs, BANNED_EXPR_WORDS);
  if (bad) {
    throw new FencedRejection(
      "mutation",
      `expression uses a banned function (${bad})`,
      "ask for aggregates over refunds — server-side functions are not data",
    );
  }
  const sneakyVerb = VERB_IN_VERBS(ast.verbs, NON_SELECT_VERBS);
  if (sneakyVerb) {
    throw new FencedRejection(
      "mutation",
      `statement contains a write verb (${sneakyVerb})`,
      "RefundLens is read-only — ask a question about the data instead of changing it",
    );
  }

  // fence #3 — mandatory LIMIT within cap
  if (ast.limit === null) {
    throw new FencedRejection(
      "no_limit",
      "generated query has no LIMIT",
      "this is a generator bug — please report it",
    );
  }
  if (ast.limit > LIMIT_MAX) {
    throw new FencedRejection(
      "limit_over_cap",
      `LIMIT ${ast.limit} exceeds the ${LIMIT_MAX} row cap`,
      `narrow the window or add filters — at most ${LIMIT_MAX} rows can come back`,
    );
  }
  return ast;
}
