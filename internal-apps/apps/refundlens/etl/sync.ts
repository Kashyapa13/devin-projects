import type { Queryable } from "../api/src/ask/executor.js";

/**
 * Hourly ETL (AGENTS.md §2 — the ONLY writer lane).
 * - reads the REPLICA via its own connection (REPLICA_DSN — pointing at
 *   the primary is a rejected-PR offense; enforced at env wiring, not here)
 * - idempotent UPSERT into refund_events_raw on (id, updated_at)
 * - agg_daily rebuilt in ONE transaction after the load
 * - sync_runs row for EVERY run, success or failure
 */

interface Rows {
  rows: Record<string, unknown>[];
}
const rowsOf = (r: unknown): Record<string, unknown>[] => (r as Rows).rows ?? [];

export interface SyncResult {
  status: "success" | "error";
  rows: number;
  watermark: string | null;
  detail?: string;
}

interface Cursor {
  wm: string | null;
  wmId: number | null;
}

async function lastWatermark(rollup: Queryable): Promise<Cursor> {
  const r = rowsOf(
    await rollup.query(
      `SELECT watermark AS w, watermark_id AS wi FROM refundlens.sync_runs
       WHERE status = 'success' AND watermark IS NOT NULL
       ORDER BY watermark DESC, watermark_id DESC LIMIT 1`,
    ),
  );
  const w = r[0]?.w;
  return {
    wm: w ? new Date(w as string | Date).toISOString() : null,
    wmId: r[0]?.wi != null ? Number(r[0].wi) : null,
  };
}

async function recordRun(
  rollup: Queryable,
  run: { status: "success" | "error"; rows: number; watermark: string | null; watermarkId?: number | null; detail?: string | undefined },
): Promise<void> {
  await rollup.query(
    `INSERT INTO refundlens.sync_runs (watermark, watermark_id, rows, status, detail, finished_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [run.watermark, run.watermarkId ?? null, run.rows, run.status, run.detail ?? null],
  );
}

/**
 * One sync: replica delta → raw upsert → single-tx agg rebuild → run row.
 * `sourceSql` names the replica-side scan; in prod it reads the source
 * refund_events feed, in tests a `source.refund_events` fixture table.
 */
export async function runSync(
  replica: Queryable,
  rollup: Queryable,
  opts: { batchSize?: number; sourceTable?: string } = {},
): Promise<SyncResult> {
  const source = opts.sourceTable ?? "refund_events";
  const cursor = await lastWatermark(rollup);
  const batch = opts.batchSize ?? 5000;
  try {
    // 1) delta read off the replica — batched, cursor on (updated_at, id)
    //    so rows sharing the boundary timestamp can never be skipped.
    const delta: Record<string, unknown>[] = [];
    let wm = cursor.wm;
    let wmId = cursor.wmId;
    for (;;) {
      const page = rowsOf(
        await replica.query(
          `SELECT id, txn_ref, occurred_at, channel, merchant_segment,
                  amount_cents, reason_code, state, latency_ms, updated_at
           FROM ${source}
           WHERE ($1::timestamptz IS NULL)
              OR updated_at > $1::timestamptz
              OR (updated_at = $1::timestamptz AND id > $2)
           ORDER BY updated_at, id
           LIMIT $3`,
          [wm, wmId ?? 0, batch],
        ),
      );
      if (page.length === 0) break;
      delta.push(...page);
      if (page.length < batch) break;
      const last = page[page.length - 1]!;
      wm = new Date(last.updated_at as string | Date).toISOString();
      wmId = Number(last.id);
    }

    // 2) upsert + rebuild + run-row in ONE transaction
    await rollup.query("BEGIN");
    try {
      for (const e of delta) {
        await rollup.query(
          `INSERT INTO refundlens.refund_events_raw
             (id, txn_ref, occurred_at, channel, merchant_segment,
              amount_cents, reason_code, state, latency_ms, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             txn_ref=EXCLUDED.txn_ref, occurred_at=EXCLUDED.occurred_at,
             channel=EXCLUDED.channel, merchant_segment=EXCLUDED.merchant_segment,
             amount_cents=EXCLUDED.amount_cents, reason_code=EXCLUDED.reason_code,
             state=EXCLUDED.state, latency_ms=EXCLUDED.latency_ms,
             updated_at=EXCLUDED.updated_at
           WHERE refundlens.refund_events_raw.updated_at <= EXCLUDED.updated_at`,
          [
            e.id, e.txn_ref, e.occurred_at, e.channel, e.merchant_segment,
            e.amount_cents, e.reason_code, e.state, e.latency_ms, e.updated_at,
          ],
        );
      }
      // transactional rebuild: upsert every freshly computed key
      await rollup.query(
        `INSERT INTO refundlens.agg_daily
           (day, channel, merchant_segment, reason_code, cnt, amount, p50_ms, p95_ms)
         SELECT occurred_at::date, channel, merchant_segment, reason_code,
                COUNT(*)::bigint, SUM(amount_cents)::bigint,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int
         FROM refundlens.refund_events_raw
         GROUP BY 1,2,3,4
         ON CONFLICT (day, channel, merchant_segment, reason_code) DO UPDATE SET
           cnt=EXCLUDED.cnt, amount=EXCLUDED.amount,
           p50_ms=EXCLUDED.p50_ms, p95_ms=EXCLUDED.p95_ms`,
      );
      // agg_hourly (heatmap grain) rebuilt in the SAME transaction —
      // a partial aggregate is a lie; both surfaces move together.
      await rollup.query(
        `INSERT INTO refundlens.agg_hourly
           (day, hour, channel, reason_code, cnt, amount)
         SELECT occurred_at::date,
                EXTRACT(hour FROM occurred_at)::smallint,
                channel, reason_code,
                COUNT(*)::bigint, SUM(amount_cents)::bigint
         FROM refundlens.refund_events_raw
         GROUP BY 1,2,3,4
         ON CONFLICT (day, hour, channel, reason_code) DO UPDATE SET
           cnt=EXCLUDED.cnt, amount=EXCLUDED.amount`,
      );
      const last = delta[delta.length - 1];
      const newWatermark = last
        ? new Date(last.updated_at as string | Date).toISOString()
        : cursor.wm;
      const newWatermarkId = last ? Number(last.id) : cursor.wmId;
      await recordRun(rollup, {
        status: "success",
        rows: delta.length,
        watermark: newWatermark,
        watermarkId: newWatermarkId,
      });
      await rollup.query("COMMIT");
      return { status: "success", rows: delta.length, watermark: newWatermark };
    } catch (e) {
      await rollup.query("ROLLBACK");
      throw e;
    }
  } catch (e) {
    // failure still writes its run row — freshness must stay verifiable
    const detail = (e as Error).message.slice(0, 500);
    await recordRun(rollup, {
      status: "error",
      rows: 0,
      watermark: cursor.wm,
      watermarkId: cursor.wmId,
      detail,
    }).catch(() => undefined);
    return { status: "error", rows: 0, watermark: cursor.wm, detail };
  }
}
