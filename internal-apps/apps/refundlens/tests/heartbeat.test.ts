import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pgHarness, runSeeds, type PgHarness } from "@company/testing";
import { loadMigrations, migrationRunner } from "@company/db";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../api/src/app.js";
import { registry } from "../scripts/seed.js";
import { runSync } from "../etl/sync.js";
import { runBeat, type BeatDeps } from "../scripts/heartbeat.js";
import { getLatestBeat, type HeartbeatBeat } from "../api/src/live.js";
import { evaluate } from "../monitors/evaluator.js";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

let pg: PgHarness;
let pool: Pool;
let app: FastifyInstance;
let base: string;

const beats: HeartbeatBeat[] = [];
const deps: BeatDeps & { apiBase?: string } = {
  replica: undefined as unknown as Pool,
  rollup: undefined as unknown as Pool,
  sourceTable: "source.refund_events",
  postBeat: async (b) => {
    beats.push(b);
  },
};

beforeAll(async () => {
  pg = await pgHarness("refundlens");
  pool = new Pool({ connectionString: pg.dsn });
  pool.on("error", () => {});
  await migrationRunner(pool).migrate(loadMigrations(MIGRATIONS));
  await runSeeds(pool, registry, "refund-seed-v1");
  await runSync(pool, pool, { sourceTable: "source.refund_events" });
  deps.replica = pool;
  deps.rollup = pool;
  app = await buildServer({
    db: pool,
    sessionSecret: "test-session-secret-fixture",
    readiness: { db: () => pool.query("SELECT 1") },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await pg.stop();
});

describe("heartbeat — beat → live registry → SSE fan-out (ADR-0016, F-10)", () => {
  it("runBeat produces a beat with the SSE payload shape", async () => {
    const { beat, sync } = await runBeat(deps);
    expect(sync.status).toBe("success");
    expect(beats).toContain(beat);
    // the exact payload shape the SSE frame carries
    expect(typeof beat.beat_at).toBe("string");
    expect(typeof beat.rows).toBe("number");
    expect(beat.watermark === null || typeof beat.watermark === "string").toBe(true);
    expect(beat.status).toBe("ok");
    expect(beat.last_event_at).toBeTruthy();
  });

  it("POST /api/internal/beat records + the SSE endpoint streams it", async () => {
    const svc = await app.session.create({ sub: "hb-test", roles: ["service"] });
    const viewer = await app.session.create({ sub: "viewer", roles: ["analyst"] });
    const beat = {
      watermark: "2026-10-09T12:00:00.000Z",
      last_event_at: "2026-10-09T12:00:00.000Z",
      beat_at: new Date().toISOString(),
      rows: 3,
      lag_s: 12,
      status: "ok" as const,
    };
    const post = await app.inject({
      method: "POST",
      url: "/api/internal/beat",
      headers: { authorization: `Bearer ${svc}` },
      payload: beat,
    });
    expect(post.statusCode).toBe(200);
    expect(getLatestBeat()?.beat_at).toBe(beat.beat_at);

    // wrong role can't post
    const bad = await app.inject({
      method: "POST",
      url: "/api/internal/beat",
      headers: { authorization: `Bearer ${viewer}` },
      payload: beat,
    });
    expect(bad.statusCode).toBe(403);

    // SSE: real HTTP (inject can't hold a hijacked stream) — first frame
    const res = await fetch(`${base}/api/stream/heartbeat?token=${encodeURIComponent(viewer)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    const frame = chunk.split("\n").find((l) => l.startsWith("data: "));
    expect(frame).toBeTruthy();
    const payload = JSON.parse(frame!.slice(6)) as HeartbeatBeat;
    expect(payload.beat_at).toBe(beat.beat_at);
    expect(payload.rows).toBe(3);
    expect(payload.lag_s).toBe(12);
    await reader.cancel();
  });

  it("a forced sync error is a DEGRADED beat — never silent — and heartbeat-age fires when stale", async () => {
    const broken = { query: () => Promise.reject(new Error("replica down")) };
    const { beat, sync } = await runBeat({ ...deps, replica: broken });
    expect(sync.status).toBe("error");
    expect(beat.status).toBe("degraded");
    expect(beat.detail).toContain("replica down");
    expect(beats[beats.length - 1]!.status).toBe("degraded");

    // push the last successful sync into the past → heartbeat-age fires
    await pool.query(`UPDATE refundlens.sync_runs SET finished_at = now() - interval '1 hour'`);
    const outcomes = await evaluate(pool);
    const hb = outcomes.find((o) => o.monitor === "heartbeat-age");
    expect(hb?.firing).toBe(true);
    expect(hb?.transitioned).toBe("firing");
    const evs = await pool.query(
      `SELECT e.state, e.value->>'seconds' AS s FROM refundlens.monitor_events e
         JOIN refundlens.monitors m ON m.id = e.monitor_id
        WHERE m.name='heartbeat-age' ORDER BY e.fired_at DESC LIMIT 1`,
    );
    expect(evs.rows[0].state).toBe("firing");
    expect(Number(evs.rows[0].s)).toBeGreaterThanOrEqual(3600);
  });
});
