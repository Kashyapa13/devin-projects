import type { Queryable } from "./ask/executor.js";

/**
 * Watermark plumbing (AGENTS.md §3/§4 — on EVERY surface; absent = P1).
 * Source of truth: the newest successful sync_runs.watermark.
 */
export interface Watermark {
  watermark: string | null;
  lag_s: number | null;
  last_run_status: string | null;
}

interface Row {
  rows: Record<string, unknown>[];
}
const rows = (r: unknown): Record<string, unknown>[] => (r as Row).rows ?? [];

export async function currentWatermark(db: Queryable): Promise<Watermark> {
  const res = rows(
    await db.query(
      `SELECT max(CASE WHEN status='success' THEN watermark END) AS wm,
              (ARRAY_AGG(status ORDER BY id DESC))[1] AS last_status,
              max(finished_at) AS last_finished
       FROM refundlens.sync_runs`,
    ),
  );
  const wm = res[0]?.wm as Date | null | undefined;
  const lag =
    wm == null
      ? null
      : Math.max(0, Math.floor((Date.now() - new Date(wm).getTime()) / 1000));
  return {
    watermark: wm ? new Date(wm).toISOString() : null,
    lag_s: lag,
    last_run_status: (res[0]?.last_status as string | null) ?? null,
  };
}
