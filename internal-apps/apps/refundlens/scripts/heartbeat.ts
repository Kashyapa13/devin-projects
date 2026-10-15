import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { runSync, type SyncResult } from "../etl/sync.js";
import { evaluate, type EvalOutcome, type Notify } from "../monitors/evaluator.js";
import type { Queryable } from "../api/src/ask/executor.js";
import type { HeartbeatBeat } from "../api/src/live.js";

/**
 * Heartbeat (ADR-0016, F-10): every HEARTBEAT_MS (default 45s) or --once —
 *   runSync (idempotent delta off REPLICA_DSN)
 *   → evaluate() each enabled monitor (firing → monitor_events + Slack)
 *   → POST the beat to POST /api/internal/beat (service role) for SSE fan-out.
 *
 * A failed sync is a DEGRADED beat, never a skipped one: the beat is
 * still recorded + posted (status="degraded"), and the heartbeat-age
 * monitor keeps evaluating so staleness fires loudly.
 */

interface Rows {
  rows: Record<string, unknown>[];
}
const rowsOf = (r: unknown): Record<string, unknown>[] => (r as Rows).rows ?? [];

export interface BeatDeps {
  replica: Queryable;
  rollup: Queryable;
  sourceTable?: string;
  /** where the API listens — beats are POSTed here (best-effort) */
  apiBase?: string | undefined;
  /** HS256 mint secret — signs the service-role beat call */
  sessionSecret?: string | undefined;
  /** injectable beat sink (tests); defaults to the HTTP POST */
  postBeat?: ((beat: HeartbeatBeat) => Promise<void>) | undefined;
  notify?: Notify | undefined;
  webhookUrl?: string | undefined;
}

async function serviceJwt(secret: string, issuer: string): Promise<string> {
  return new SignJWT({ sub: "refundlens-heartbeat", roles: ["service"] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("120s")
    .sign(new TextEncoder().encode(secret));
}

/** One beat. Always resolves — the beat row/SSE is the liveness contract. */
export async function runBeat(
  deps: BeatDeps,
): Promise<{ beat: HeartbeatBeat; sync: SyncResult; monitors: EvalOutcome[] }> {
  let sync: SyncResult;
  try {
    sync = await runSync(deps.replica, deps.rollup, {
      ...(deps.sourceTable ? { sourceTable: deps.sourceTable } : {}),
    });
  } catch (e) {
    sync = { status: "error", rows: 0, watermark: null, detail: (e as Error).message.slice(0, 300) };
  }

  // monitors evaluate even (especially) on a degraded beat — heartbeat-age
  // is the one watching the sync itself
  const monitors = await evaluate(deps.rollup, {
    ...(deps.notify ? { notify: deps.notify } : {}),
    ...(deps.webhookUrl ? { webhookUrl: deps.webhookUrl } : {}),
  }).catch(() => [] as EvalOutcome[]);

  const wmRow = rowsOf(
    await deps.rollup.query(
      `SELECT (SELECT max(watermark) FROM refundlens.sync_runs WHERE status='success') AS wm,
              (SELECT max(updated_at) FROM refundlens.refund_events_raw) AS last_ev`,
    ),
  )[0];
  const watermark =
    sync.watermark ??
    (wmRow?.wm ? new Date(wmRow.wm as string | Date).toISOString() : null);
  const lastEvent = wmRow?.last_ev
    ? new Date(wmRow.last_ev as string | Date).toISOString()
    : null;

  const beat: HeartbeatBeat = {
    watermark,
    last_event_at: lastEvent,
    beat_at: new Date().toISOString(),
    rows: sync.rows,
    lag_s: watermark
      ? Math.max(0, Math.floor((Date.now() - new Date(watermark).getTime()) / 1000))
      : null,
    status: sync.status === "success" ? "ok" : "degraded",
    ...(sync.detail ? { detail: sync.detail } : {}),
  };

  const post =
    deps.postBeat ??
    (async (b: HeartbeatBeat) => {
      const base = deps.apiBase;
      const secret = deps.sessionSecret;
      if (!base || !secret) return; // no API wired — beat stays in-process
      try {
        const jwt = await serviceJwt(secret, process.env.SSO_ISSUER ?? "refundlens");
        await fetch(`${base}/api/internal/beat`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
          body: JSON.stringify(b),
        });
      } catch {
        // API down ≠ silent: sync_runs already carries the sync outcome;
        // the SSE surface just shows the last good beat
      }
    });
  await post(beat);
  return { beat, sync, monitors };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const replicaDsn = process.env.REPLICA_DSN;
  const rollupDsn = process.env.DATABASE_URL;
  if (!replicaDsn) throw new Error("REPLICA_DSN is required (vault)");
  if (!rollupDsn) throw new Error("DATABASE_URL is required (vault)");
  const { Pool } = await import("pg");
  const replica = new Pool({ connectionString: replicaDsn });
  const rollup = new Pool({ connectionString: rollupDsn });
  const once = process.argv.includes("--once");
  const ms = Math.max(5_000, Number(process.env.HEARTBEAT_MS ?? 45_000));
  const deps: BeatDeps = {
    replica,
    rollup,
    sourceTable: process.env.SOURCE_TABLE ?? "refund_events",
    apiBase: process.env.API_BASE ?? `http://localhost:${process.env.API_PORT ?? 8080}`,
    sessionSecret: process.env.SESSION_SECRET,
  };
  try {
    if (once) {
      const { beat, monitors } = await runBeat(deps);
      console.log(JSON.stringify({ beat, monitors }));
    } else {
      const tick = () =>
        runBeat(deps)
          .then(({ beat }) =>
            console.log(JSON.stringify({ at: beat.beat_at, status: beat.status, lag_s: beat.lag_s })),
          )
          .catch((e) => console.error("beat failed", e));
      await tick();
      setInterval(tick, ms);
      console.log(`heartbeat every ${ms}ms → ${deps.apiBase}/api/internal/beat`);
    }
  } finally {
    if (once) {
      await replica.end();
      await rollup.end();
    }
  }
}
