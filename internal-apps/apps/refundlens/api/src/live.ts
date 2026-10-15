import type { Queryable } from "./ask/executor.js";

/**
 * Live tier (ADR-0016): the in-process beat registry. The heartbeat
 * script POSTs each beat to /api/internal/beat; recordBeat() stores it
 * and fans it out to every open /api/stream/heartbeat SSE client.
 * A skipped beat must never be silent — degraded beats are recorded
 * with status="degraded" and fan out the same way.
 */

export interface HeartbeatBeat {
  /** rollup cursor — newest successful sync_runs.watermark */
  watermark: string | null;
  /** newest refund_events_raw.updated_at observed (ingestion recency) */
  last_event_at: string | null;
  /** when the beat ran (ISO) — LiveDot age derives from this */
  beat_at: string;
  /** rows upserted by this beat's sync (0 on a degraded beat) */
  rows: number;
  /** seconds between beat_at and watermark — the freshness number */
  lag_s: number | null;
  status: "ok" | "degraded";
  detail?: string;
}

type Listener = (beat: HeartbeatBeat) => void;

let latest: HeartbeatBeat | null = null;
const listeners = new Set<Listener>();

export function recordBeat(beat: HeartbeatBeat): void {
  latest = beat;
  for (const fn of [...listeners]) {
    try {
      fn(beat);
    } catch {
      // a dead SSE client must never break the fan-out
    }
  }
}

export function getLatestBeat(): HeartbeatBeat | null {
  return latest;
}

export function subscribeBeat(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Pre-first-beat snapshot: synthesize a beat-shaped payload from
 * sync_runs so a client that connects before the heartbeat script has
 * ever posted still gets watermark + lag — never a blank surface.
 */
export async function snapshotBeat(db: Queryable): Promise<HeartbeatBeat> {
  const r = (await db.query(
    `SELECT max(watermark) FILTER (WHERE status='success') AS wm,
            max(finished_at) FILTER (WHERE status='success') AS fin
       FROM refundlens.sync_runs`,
  )) as { rows: Record<string, unknown>[] };
  const wm = r.rows[0]?.wm;
  const watermark = wm ? new Date(wm as string | Date).toISOString() : null;
  return {
    watermark,
    last_event_at: null,
    beat_at: r.rows[0]?.fin
      ? new Date(r.rows[0].fin as string | Date).toISOString()
      : new Date(0).toISOString(),
    rows: 0,
    lag_s: watermark
      ? Math.max(0, Math.floor((Date.now() - new Date(watermark).getTime()) / 1000))
      : null,
    status: "degraded",
    detail: "no heartbeat recorded yet — showing last sync state",
  };
}
