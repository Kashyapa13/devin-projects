import { FencedRejection, WIDGET_SCOPE } from "./ask/fence.js";
import { runFenced, type Queryable } from "./ask/executor.js";

/**
 * WIDGET LAW (ADR-0015): every dashboard widget is a server-computed
 * series through the SAME fenced aggregation layer. Clients send typed
 * params only — never SQL. Each widget renders its query here and runs
 * it through runFenced (AST + six fences), so the BI bar buys ZERO
 * fence exceptions.
 */

export interface WidgetParams {
  from?: string | undefined;          // ISO date/datetime
  to?: string | undefined;
  grain?: "day" | "hour" | "minute" | undefined;
  channel?: string | undefined;
  segment?: string | undefined;
  reason?: string | undefined;
  state?: string | undefined;
  compare?: boolean | undefined;
  dim?: "channel" | "merchant_segment" | "reason_code" | undefined;
  metric?: "count" | "amount" | "rate" | undefined;
  sort?: "count" | "amount" | "rate" | undefined;
  limit?: number | undefined;
  top?: number | undefined;
}

const DIMS = new Set(["channel", "merchant_segment", "reason_code"]);
const METRICS = new Set(["count", "amount", "rate"]);

/** The widget surface (F-12..F-16) — the whole BI bar, nothing else. */
export const WIDGETS = [
  "kpi", "timeseries", "heatmap", "donut", "topn",
  "scatter", "detail", "monitors_panel", "sync_health",
] as const;

function parseDate(s: string | undefined, fallbackDays: number): Date {
  if (s) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() - fallbackDays * 86_400_000);
}

/** where-clause fragment shared by every widget query (params only). */
function where(p: WidgetParams, from: Date, to: Date) {
  const conds = ["occurred_at >= $1::timestamptz", "occurred_at < $2::timestamptz"];
  const params: unknown[] = [from.toISOString(), to.toISOString()];
  const push = (col: string, v?: string) => {
    if (v) { params.push(v); conds.push(`${col} = $${params.length}`); }
  };
  push("channel", p.channel);
  push("merchant_segment", p.segment);
  push("reason_code", p.reason);
  push("state", p.state);
  return { sql: conds.join(" AND "), params };
}

export interface WidgetResult {
  widget: string;
  series: Record<string, unknown>[];
  compare?: Record<string, unknown>[] | undefined;
  /** timeseries only: server-computed band + z-score anomaly markers,
   *  labeled heuristic (F-13) — never client-side aggregation. */
  stats?: { mean: number; stddev: number; upper: number } | undefined;
  anomalies?: { bucket: string; z: number }[] | undefined;
  watermark: string | null;
  took_ms: number;
}

/** z-score anomaly markers over per-bucket totals (heuristic — the
 *  marker always carries that label on the surface). |z|>3, cap 20. */
function zAnomalies(
  rows: Record<string, unknown>[],
): { stats: { mean: number; stddev: number; upper: number }; anomalies: { bucket: string; z: number }[] } {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const b = String(r.bucket);
    totals.set(b, (totals.get(b) ?? 0) + Number(r.v ?? 0));
  }
  const vals = [...totals.values()];
  const mean = vals.reduce((s, v) => s + v, 0) / Math.max(vals.length, 1);
  const variance =
    vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(vals.length, 1);
  const stddev = Math.sqrt(variance);
  const anomalies: { bucket: string; z: number }[] = [];
  if (stddev > 0) {
    for (const [bucket, v] of totals) {
      const z = (v - mean) / stddev;
      if (Math.abs(z) > 3) anomalies.push({ bucket, z: Math.round(z * 100) / 100 });
    }
  }
  anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return {
    stats: {
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      upper: Math.round((mean + 3 * stddev) * 100) / 100,
    },
    anomalies: anomalies.slice(0, 20),
  };
}

async function latestWatermark(db: Queryable): Promise<string | null> {
  const r = (await db.query(
    `SELECT watermark AS w FROM refundlens.sync_runs
     WHERE status='success' ORDER BY watermark DESC LIMIT 1`,
  )) as { rows: Record<string, unknown>[] };
  const w = r.rows[0]?.w;
  return w ? new Date(w as string | Date).toISOString() : null;
}

/**
 * One widget: typed params → SQL rendered server-side → fenced exec.
 * Unknown widget names and unknown dims are fenced rejections (same
 * envelope as the ask path — never a best effort).
 */
export async function runWidget(
  db: Queryable,
  name: string,
  p: WidgetParams,
): Promise<WidgetResult> {
  const from = parseDate(p.from, 30);
  const to = parseDate(p.to, 0);
  const { sql: W, params } = where(p, from, to);
  const lim = Math.min(Math.max(p.limit ?? 500, 1), 5000);
  let sql = "";

  switch (name) {
    case "kpi": {
      sql = `SELECT
        COUNT(*) FILTER (WHERE occurred_at::date = $2::date - 1)::bigint AS refunds_today,
        ROUND(100.0 * COUNT(*)::numeric / NULLIF((
          SELECT COUNT(*) FROM refundlens.refund_events_raw)::numeric, 0), 2) AS refund_rate_pct,
        SUM(amount_cents)::bigint AS total_refunded_cents,
        COUNT(*) FILTER (WHERE state = 'PENDING')::bigint AS pending_count,
        SUM(amount_cents) FILTER (WHERE state = 'PENDING')::bigint AS pending_cents,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS avg_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms,
        (SELECT reason_code FROM refundlens.refund_events_raw
          WHERE ${W} GROUP BY reason_code ORDER BY COUNT(*) DESC LIMIT 1) AS top_reason,
        COUNT(*) FILTER (WHERE state = 'PENDING' AND occurred_at < $2::timestamptz - interval '72 hours')::bigint AS at_risk_count
      FROM refundlens.refund_events_raw WHERE ${W} LIMIT ${lim}`;
      break;
    }
    case "timeseries": {
      const dim = p.dim ?? "channel";
      if (!DIMS.has(dim)) throw new FencedRejection("cost_cap", `unknown dim ${dim}`, "use channel|merchant_segment|reason_code");
      const metric = p.metric ?? "count";
      if (!METRICS.has(metric)) throw new FencedRejection("cost_cap", `unknown metric ${metric}`, "use count|amount|rate");
      const bucket = p.grain === "minute"
        ? `date_trunc('minute', occurred_at)`
        : p.grain === "hour"
          ? `date_trunc('hour', occurred_at)`
          : `occurred_at::date`;
      const val = p.metric === "amount" ? "SUM(amount_cents)::bigint" : "COUNT(*)::bigint";
      // grouped series default to the fence max — a truncated time
      // series is a lying chart; the LIMIT stays in the SQL either way
      const tslim = Math.min(Math.max(p.limit ?? 5000, 1), 5000);
      sql = `SELECT ${bucket} AS bucket, ${dim} AS dim, ${val} AS v,
               COUNT(*)::bigint AS n
             FROM refundlens.refund_events_raw WHERE ${W}
             GROUP BY 1, 2 ORDER BY 1, 2 LIMIT ${tslim}`;
      break;
    }
    case "heatmap": {
      sql = `SELECT EXTRACT(dow FROM occurred_at)::int AS dow,
               EXTRACT(hour FROM occurred_at)::int AS hour,
               COUNT(*)::bigint AS v
             FROM refundlens.refund_events_raw WHERE ${W}
             GROUP BY 1, 2 ORDER BY 1, 2 LIMIT ${lim}`;
      break;
    }
    case "donut": {
      const dim = p.dim ?? "reason_code";
      if (!DIMS.has(dim)) throw new FencedRejection("cost_cap", `unknown dim ${dim}`, "use channel|merchant_segment|reason_code");
      sql = `SELECT ${dim} AS label, COUNT(*)::bigint AS v, SUM(amount_cents)::bigint AS amount
             FROM refundlens.refund_events_raw WHERE ${W}
             GROUP BY 1 ORDER BY 2 DESC LIMIT ${lim}`;
      break;
    }
    case "topn": {
      const dim = p.dim ?? "merchant_segment";
      if (!DIMS.has(dim)) throw new FencedRejection("cost_cap", `unknown dim ${dim}`, "use channel|merchant_segment|reason_code");
      const sort = p.sort === "amount" ? "amount" : p.sort === "rate" ? "rate" : "cnt";
      const n = Math.min(Math.max(p.top ?? 10, 1), 50);
      sql = `SELECT ${dim} AS label, COUNT(*)::bigint AS cnt,
               SUM(amount_cents)::bigint AS amount,
               ROUND(100.0 * COUNT(*)::numeric /
                 NULLIF((SELECT COUNT(*) FROM refundlens.refund_events_raw WHERE ${W})::numeric,0), 2) AS rate
             FROM refundlens.refund_events_raw WHERE ${W}
             GROUP BY 1 ORDER BY ${sort} DESC LIMIT ${n}`;
      break;
    }
    case "scatter": {
      sql = `SELECT latency_ms::int AS x, amount_cents::bigint AS y
             FROM refundlens.refund_events_raw WHERE ${W} AND latency_ms IS NOT NULL
             ORDER BY occurred_at DESC LIMIT ${lim}`;
      break;
    }
    case "detail": {
      sql = `SELECT id, txn_ref, occurred_at, channel, merchant_segment,
               amount_cents, reason_code, state, latency_ms
             FROM refundlens.refund_events_raw WHERE ${W}
             ORDER BY occurred_at DESC LIMIT ${lim}`;
      break;
    }
    case "monitors_panel": {
      sql = `SELECT m.name, m.severity, m.owner, m.enabled, m.version,
               (SELECT MAX(e.fired_at) FROM refundlens.monitor_events e
                 WHERE e.monitor_id = m.id) AS last_fired,
               (SELECT e2.state FROM refundlens.monitor_events e2
                 WHERE e2.monitor_id = m.id ORDER BY e2.fired_at DESC LIMIT 1) AS state
             FROM refundlens.monitors m ORDER BY m.name LIMIT ${lim}`;
      break;
    }
    case "sync_health": {
      sql = `SELECT id, watermark, rows, status, started_at, finished_at
             FROM refundlens.sync_runs ORDER BY id DESC LIMIT ${Math.min(lim, 50)}`;
      break;
    }
    default:
      throw new FencedRejection(
        "cost_cap",
        `unknown widget ${name}`,
        "use kpi|timeseries|heatmap|donut|topn|scatter|detail|monitors_panel|sync_health",
      );
  }

  // widgets that don't embed the shared WHERE (monitors_panel,
  // sync_health) carry no placeholders — passing params would make the
  // bind fail; bind only what the statement references.
  const bound = /\$\d/.test(sql) ? params : [];
  const t0 = process.hrtime.bigint();
  const { rows, ms } = await runFenced(db, sql, bound, { scope: WIDGET_SCOPE });
  let compare: Record<string, unknown>[] | undefined;
  if (p.compare) {
    // period-over-period: identical query, bounds shifted back one span
    const span = to.getTime() - from.getTime();
    const shifted = [...params];
    shifted[0] = new Date(from.getTime() - span).toISOString();
    shifted[1] = from.toISOString();
    compare = (await runFenced(db, sql, bound.length ? shifted : [], { scope: WIDGET_SCOPE })).rows;
  }
  const watermark = await latestWatermark(db);
  const took_ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const z = name === "timeseries" ? zAnomalies(rows) : null;
  return {
    widget: name,
    series: rows,
    ...(compare ? { compare } : {}),
    ...(z ? { stats: z.stats, anomalies: z.anomalies } : {}),
    watermark,
    took_ms: Math.round(Math.max(took_ms, ms) * 10) / 10,
  };
}
