import { runFenced, type Queryable } from "../api/src/ask/executor.js";
import { WIDGET_SCOPE } from "../api/src/ask/fence.js";

/**
 * Monitors-as-code (ADR-0016, F-11): definitions live versioned in
 * refundlens.monitors and are evaluated every heartbeat beat. Metric
 * reads go through the SAME fenced executor as the widget surface —
 * live mode buys zero fence exceptions. Firings land in monitor_events
 * (the audit trail) and are pushed to Slack via webhook when configured.
 *
 * Semantics:
 * - heartbeat_age_s: seconds since the last SUCCESSFUL sync finished —
 *   the heartbeat watching itself; a degraded beat fires it, loudly.
 * - refund_rate_zscore: last-24h refund COUNT vs the trailing ~30-day
 *   daily-count distribution (mean/stddev) → z-score.
 * - refund_volume: last-24h refund AMOUNT (cents) vs the same trailing
 *   daily-sum distribution → z-score.
 * - backlog_oldest_h: age in hours of the oldest PENDING refund.
 *
 * Transitions are the audit contract: ok→firing writes a 'firing'
 * event + notifies; firing→ok writes 'resolved'; steady-state writes
 * nothing (the events table is an incident log, not telemetry spam).
 */

export interface MonitorDef {
  id: string;
  name: string;
  metric: string;
  window: string;
  condition: "gt" | "lt" | "zscore_gt" | "age_gt";
  threshold: Record<string, number>;
  severity: string;
  owner: string;
  enabled: boolean;
  version: number;
}

export interface EvalOutcome {
  monitor: string;
  metric: string;
  firing: boolean;
  transitioned: "firing" | "resolved" | null;
  value: Record<string, number | null>;
  detail: string;
}

interface Rows {
  rows: Record<string, unknown>[];
}
const rowsOf = (r: unknown): Record<string, unknown>[] => (r as Rows).rows ?? [];

/** Notification channel — Slack webhook by default; tests inject a stub. */
export type Notify = (msg: { monitor: MonitorDef; text: string; value: Record<string, number | null> }) => Promise<void>;

async function one(db: Queryable, sql: string): Promise<number | null> {
  const { rows } = await runFenced(db, sql, [], { scope: WIDGET_SCOPE });
  const v = rows[0]?.v;
  return v === null || v === undefined ? null : Number(v);
}

async function baseline(
  db: Queryable,
  expr: string,
): Promise<{ mean: number; stddev: number }> {
  const { rows } = await runFenced(
    db,
    `SELECT occurred_at::date AS d, ${expr} AS c
       FROM refundlens.refund_events_raw
      WHERE occurred_at >= now() - interval '31 days'
        AND occurred_at < now() - interval '24 hours'
      GROUP BY 1 ORDER BY 1 LIMIT 40`,
    [],
    { scope: WIDGET_SCOPE },
  );
  const vals = rows.map((r) => Number(r.c ?? 0));
  const mean = vals.reduce((s, v) => s + v, 0) / Math.max(vals.length, 1);
  const variance =
    vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(vals.length, 1);
  return { mean, stddev: Math.sqrt(variance) };
}

/** Resolve a monitor's current value + whether its condition fires. */
async function measure(
  db: Queryable,
  m: MonitorDef,
): Promise<{ firing: boolean; value: Record<string, number | null>; detail: string }> {
  switch (m.metric) {
    case "heartbeat_age_s": {
      const v = await one(
        db,
        `SELECT EXTRACT(EPOCH FROM (now() - max(finished_at)))::int AS v
           FROM refundlens.sync_runs WHERE status='success' LIMIT 1`,
      );
      const limit = m.threshold["seconds"] ?? 300;
      // no successful sync ever = infinitely stale → fires
      const firing = v === null || v > limit;
      return {
        firing,
        value: { seconds: v },
        detail: v === null ? "no successful sync recorded" : `last success ${v}s ago (>${limit}s)`,
      };
    }
    case "backlog_oldest_h": {
      const v = await one(
        db,
        `SELECT ROUND(EXTRACT(EPOCH FROM (now() - min(occurred_at))) / 3600.0)::int AS v
           FROM refundlens.refund_events_raw WHERE state = 'PENDING' LIMIT 1`,
      );
      const limit = m.threshold["hours"] ?? 72;
      const firing = v !== null && v > limit;
      return {
        firing,
        value: { hours: v },
        detail: `oldest pending ${v ?? "—"}h (>${limit}h)`,
      };
    }
    case "refund_rate_zscore":
    case "refund_volume": {
      const expr = m.metric === "refund_volume" ? "SUM(amount_cents)::bigint" : "COUNT(*)::bigint";
      const v = await one(
        db,
        `SELECT ${expr} AS v FROM refundlens.refund_events_raw
          WHERE occurred_at >= now() - interval '24 hours' LIMIT 1`,
      );
      const { mean, stddev } = await baseline(db, expr);
      const z = stddev > 0 ? ((v ?? 0) - mean) / stddev : 0;
      const limit = m.threshold["z"] ?? 3;
      return {
        firing: z > limit,
        value: { value: v, mean, stddev, z: Math.round(z * 100) / 100 },
        detail: `24h ${v ?? 0} vs trailing mean ${mean.toFixed(1)}±${stddev.toFixed(1)} → z=${z.toFixed(2)} (>${limit})`,
      };
    }
    default:
      return {
        firing: false,
        value: {},
        detail: `unknown metric ${m.metric} — skipped (def update needed)`,
      };
  }
}

function lastEventState(rows: Record<string, unknown>[]): string | null {
  return (rows[0]?.state as string | null) ?? null;
}

/**
 * Evaluate every enabled monitor once. Order-insensitive, idempotent on
 * transitions. `notify` defaults to the webhook POST; inject a stub in
 * tests (MONITOR_WEBHOOK env or the option).
 */
export async function evaluate(
  db: Queryable,
  opts: { notify?: Notify; webhookUrl?: string | undefined } = {},
): Promise<EvalOutcome[]> {
  const notify: Notify =
    opts.notify ??
    (async ({ text }) => {
      const url = opts.webhookUrl ?? process.env.MONITOR_WEBHOOK ?? process.env.SLACK_WEBHOOK_URL;
      if (!url) return; // webhook optional — never required
      try {
        await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
      } catch {
        // a dead webhook must never break the monitor loop — the
        // monitor_events row is the audit of record
      }
    });

  const monitors = rowsOf(
    await db.query(
      `SELECT id::text, name, metric, "window", condition, threshold,
              severity, owner, enabled, version
         FROM refundlens.monitors WHERE enabled ORDER BY name`,
    ),
  ) as unknown as MonitorDef[];

  const out: EvalOutcome[] = [];
  for (const m of monitors) {
    const threshold =
      typeof m.threshold === "string" ? (JSON.parse(m.threshold) as Record<string, number>) : m.threshold;
    const def = { ...m, threshold };
    let evald;
    try {
      evald = await measure(db, def);
    } catch (e) {
      // a broken metric must not stop the other monitors — record as an
      // outcome so the panel shows it was evaluated
      out.push({
        monitor: def.name,
        metric: def.metric,
        firing: false,
        transitioned: null,
        value: {},
        detail: `evaluation error: ${(e as Error).message.slice(0, 200)}`,
      });
      continue;
    }

    const prev = lastEventState(
      rowsOf(
        await db.query(
          `SELECT state FROM refundlens.monitor_events
            WHERE monitor_id = $1 ORDER BY fired_at DESC LIMIT 1`,
          [def.id],
        ),
      ),
    );

    let transitioned: "firing" | "resolved" | null = null;
    if (evald.firing && prev !== "firing") {
      transitioned = "firing";
      await db.query(
        `INSERT INTO refundlens.monitor_events (monitor_id, value, state)
         VALUES ($1, $2::jsonb, 'firing')`,
        [def.id, JSON.stringify(evald.value)],
      );
      await notify({
        monitor: def,
        text: `:warning: refundlens monitor *${def.name}* (${def.severity}) firing — ${evald.detail}`,
        value: evald.value,
      });
    } else if (!evald.firing && prev === "firing") {
      transitioned = "resolved";
      await db.query(
        `INSERT INTO refundlens.monitor_events (monitor_id, value, state)
         VALUES ($1, $2::jsonb, 'resolved')`,
        [def.id, JSON.stringify(evald.value)],
      );
      await notify({
        monitor: def,
        text: `:white_check_mark: refundlens monitor *${def.name}* resolved — ${evald.detail}`,
        value: evald.value,
      });
    }

    out.push({
      monitor: def.name,
      metric: def.metric,
      firing: evald.firing,
      transitioned,
      value: evald.value,
      detail: evald.detail,
    });
  }
  return out;
}
