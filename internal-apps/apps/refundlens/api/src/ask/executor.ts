import { createHash } from "node:crypto";
import {
  COST_CAP,
  FencedRejection,
  validateSql,
  type FenceScope,
} from "./fence.js";

export interface Queryable {
  query(text: string, params?: readonly unknown[]): Promise<unknown>;
}
interface Rows {
  rows: Record<string, unknown>[];
  fields?: { name: string }[];
}
const asRows = (r: unknown): Rows => r as Rows;

export interface FenceExecutorOptions {
  /** fence #4 — statement_timeout ms applied to the read session */
  timeoutMs?: number;
  /** fence #5 — EXPLAIN total-cost ceiling */
  costCap?: number;
  /** table scope — ask path keeps the default (tightest); widgets/monitor
   *  evaluation pass WIDGET_SCOPE (ADR-0018) */
  scope?: FenceScope;
}

/**
 * Fenced execution (LLD §fence order): parse AST → check fences →
 * EXPLAIN cost cap → execute on the read-only role with
 * statement_timeout. The role + timeout are applied per-connection so
 * the DB itself backstops the AST check (fence #1/#4 are DB-layer, not
 * app-layer hopes).
 */
export async function runFenced(
  db: Queryable,
  sql: string,
  params: readonly unknown[],
  opts: FenceExecutorOptions = {},
): Promise<{ rows: Record<string, unknown>[]; ms: number }> {
  validateSql(sql, opts.scope ?? {}); // fences 2/3/6 + AST (throws FencedRejection)

  const timeoutMs = opts.timeoutMs ?? 5000;
  const costCap = opts.costCap ?? COST_CAP;

  // fence #2 (schema pin) + #4 (timeout) at the session layer
  await db.query(`SET search_path = refundlens, public`);
  await db.query(`SET statement_timeout = ${timeoutMs}`);

  // fence #5 — EXPLAIN before execute
  const plan = asRows(await db.query(`EXPLAIN ${sql}`, params));
  const firstLine = String(plan.rows[0]?.["QUERY PLAN"] ?? "");
  const m = /cost=[\d.]+\.\.([\d.]+)/.exec(firstLine);
  const total = m ? Number(m[1]) : 0;
  if (total > costCap) {
    throw new FencedRejection(
      "cost_cap",
      `estimated cost ${Math.round(total)} exceeds the ${costCap} cap`,
      "narrow the window or add filters (channel, segment, reason) and try again",
    );
  }

  const started = process.hrtime.bigint();
  try {
    const res = asRows(await db.query(sql, params));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return { rows: res.rows, ms: Math.round(ms * 10) / 10 };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "57014") {
      // statement_timeout fired — a runtime fence, reported as 'error'
      // outcome but surfaced with guidance rather than a bare 500
      throw new FencedRejection(
        "timeout",
        "the query exceeded the 5s statement timeout",
        "narrow the window or ask a more specific question",
      );
    }
    throw e;
  }
}

/** Cache key: normalized-SQL hash + bound params (params change results). */
export function normalizeSql(sql: string): string {
  return sql.toLowerCase().replace(/\s+/g, " ").trim();
}
export function cacheKey(sql: string, params: readonly unknown[]): string {
  return createHash("sha256")
    .update(normalizeSql(sql))
    .update("\0")
    .update(JSON.stringify(params))
    .digest("hex");
}
