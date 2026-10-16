import { LIMIT_DEFAULT, LIMIT_MAX } from "./fence.js";

/**
 * The template renderer contract (LLD): clients send TYPED PARAMS only —
 * {dim, metric, from, to, filters[]} — and the server renders SQL from
 * allowlisted registries. Every value is a bound parameter; identifiers
 * can only ever come from these tables, never from user input.
 */

export const DIMS = {
  day: { col: "day", label: "day" },
  channel: { col: "channel", label: "channel" },
  merchant_segment: { col: "merchant_segment", label: "merchant segment" },
  reason_code: { col: "reason_code", label: "reason" },
} as const;
export type Dim = keyof typeof DIMS;

export const METRICS = {
  count: { expr: "SUM(cnt)::bigint", label: "refund count", raw: "COUNT(*)" },
  amount: { expr: "SUM(amount)::bigint", label: "refund amount (cents)", raw: "SUM(amount_cents)::bigint" },
  p50_ms: { expr: "AVG(p50_ms)::int", label: "typical latency (ms)", raw: "percentile_cont(0.5) within group (order by latency_ms)" },
  p95_ms: { expr: "AVG(p95_ms)::int", label: "p95 latency (ms)", raw: "percentile_cont(0.95) within group (order by latency_ms)" },
} as const;
export type Metric = keyof typeof METRICS;

/** Fields filters may target — allowlisted, typed per op. */
export const FILTER_FIELDS = {
  channel: { col: "channel", type: "text" },
  merchant_segment: { col: "merchant_segment", type: "text" },
  reason_code: { col: "reason_code", type: "text" },
  state: { col: "state", type: "text" },
} as const;
export type FilterField = keyof typeof FILTER_FIELDS;
export const FILTER_OPS = { eq: "=", ne: "<>", like: "ILIKE" } as const;
export type FilterOp = keyof typeof FILTER_OPS;

export interface ViewParams {
  dim: Dim;
  metric: Metric;
  /** YYYY-MM-DD window on the agg `day` column */
  from: string;
  to: string;
  filters?: { field: FilterField; op: FilterOp; value: string }[];
  limit?: number;
}

export interface RenderedQuery {
  sql: string;
  params: unknown[];
  /** one-line human answer frame for the card */
  frame: { metric: string; dim: string; from: string; to: string };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(v: string, name: string): void {
  if (!DATE_RE.test(v)) {
    throw new Error(`invalid ${name} date "${v}" — expected YYYY-MM-DD`);
  }
}

/** agg_daily breakdown — the console view AND the ask box share this. */
export function renderAggQuery(p: ViewParams): RenderedQuery {
  const dim = DIMS[p.dim];
  const metric = METRICS[p.metric];
  if (!dim) throw new Error(`unknown dim "${p.dim}" — allowed: ${Object.keys(DIMS).join(", ")}`);
  if (!metric) throw new Error(`unknown metric "${p.metric}" — allowed: ${Object.keys(METRICS).join(", ")}`);
  checkDate(p.from, "from");
  checkDate(p.to, "to");
  const params: unknown[] = [p.from, p.to];
  const conds = ["day BETWEEN $1 AND $2"];
  for (const f of p.filters ?? []) {
    const field = FILTER_FIELDS[f.field];
    if (!field) throw new Error(`unknown filter field "${f.field}"`);
    const op = FILTER_OPS[f.op];
    if (!op) throw new Error(`unknown filter op "${f.op}"`);
    params.push(f.value);
    conds.push(`${field.col} ${op} $${params.length}`);
  }
  const limit = Math.min(p.limit ?? LIMIT_DEFAULT, LIMIT_MAX);
  const sql =
    `SELECT ${dim.col}, ${metric.expr} AS value FROM agg_daily ` +
    `WHERE ${conds.join(" AND ")} GROUP BY ${dim.col} ORDER BY ${dim.col} LIMIT ${limit}`;
  return { sql, params, frame: { metric: metric.label, dim: dim.label, from: p.from, to: p.to } };
}

/** Raw event listing — "show me the refunds" questions hit raw rows. */
export function renderRawQuery(p: {
  from: string;
  to: string;
  filters?: { field: FilterField; op: FilterOp; value: string }[];
  limit?: number;
}): RenderedQuery {
  checkDate(p.from, "from");
  checkDate(p.to, "to");
  const params: unknown[] = [p.from, p.to];
  const conds = ["occurred_at::date BETWEEN $1 AND $2"];
  for (const f of p.filters ?? []) {
    const field = FILTER_FIELDS[f.field];
    if (!field) throw new Error(`unknown filter field "${f.field}"`);
    const op = FILTER_OPS[f.op];
    if (!op) throw new Error(`unknown filter op "${f.op}"`);
    params.push(f.value);
    conds.push(`${field.col} ${op} $${params.length}`);
  }
  const limit = Math.min(p.limit ?? LIMIT_DEFAULT, LIMIT_MAX);
  const sql =
    `SELECT id, txn_ref, occurred_at, channel, merchant_segment, ` +
    `reason_code, state, amount_cents, latency_ms FROM refund_events_raw ` +
    `WHERE ${conds.join(" AND ")} ORDER BY occurred_at DESC LIMIT ${limit}`;
  return { sql, params, frame: { metric: "refund events", dim: "row", from: p.from, to: p.to } };
}
