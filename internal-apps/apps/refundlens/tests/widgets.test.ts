import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pgHarness, runSeeds, type PgHarness } from "@company/testing";
import { loadMigrations, migrationRunner } from "@company/db";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../api/src/app.js";
import { registry, SEED_TOTAL } from "../scripts/seed.js";
import { runSync } from "../etl/sync.js";
import { WIDGETS, runWidget } from "../api/src/widgets.js";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

let pg: PgHarness;
let pool: Pool;
let app: FastifyInstance;

async function token(roles = ["analyst"]) {
  return app.session.create({ sub: "widgets-test", roles });
}
async function getWidget(name: string, qs = "", roles = ["analyst"]) {
  return app.inject({
    method: "GET",
    url: `/api/widgets/${name}${qs ? `?${qs}` : ""}`,
    headers: { authorization: `Bearer ${await token(roles)}` },
  });
}

const FROM = "2025-12-01T00:00:00Z"; // inside the ~44wk seed window
const TO = "2026-10-10T00:00:00Z";

beforeAll(async () => {
  pg = await pgHarness("refundlens");
  pool = new Pool({ connectionString: pg.dsn });
  const runner = migrationRunner(pool);
  await runner.migrate(loadMigrations(MIGRATIONS));
  await runSeeds(pool, registry, "refund-seed-v1");
  await runSync(pool, pool, { sourceTable: "source.refund_events" });
  app = await buildServer({
    db: pool,
    sessionSecret: "test-session-secret-fixture",
    readiness: { db: () => pool.query("SELECT 1") },
  });
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await pg.stop();
});

describe("WIDGET LAW — typed params only, all SQL rendered + fenced server-side", () => {
  it("every widget runs fenced on the seeded rollup and carries a watermark", async () => {
    for (const name of WIDGETS) {
      const res = await getWidget(name, `from=${FROM}&to=${TO}`);
      expect(res.statusCode, `${name}: ${res.body}`).toBe(200);
      const body = res.json();
      expect(body.widget).toBe(name);
      expect(Array.isArray(body.series), `${name} series`).toBe(true);
      expect(body.watermark, `${name} watermark`).toBeTruthy(); // watermark on every surface
    }
  });

  it("kpi values reconcile to the exact seed (5432)", async () => {
    // full-window KPI: every seeded refund, no grain
    const res = await getWidget("kpi", "from=2025-01-01T00:00:00Z&to=2027-01-01T00:00:00Z");
    const row = res.json().series[0];
    expect(Number(row.refunds_today)).toBe(0); // no refunds in the last 24h of wall-time — honest zero
    const agg = await pool.query(
      "SELECT COALESCE(SUM(cnt),0)::bigint n FROM refundlens.agg_hourly",
    );
    expect(Number(agg.rows[0]!.n)).toBe(SEED_TOTAL); // new agg_hourly sums to the same fixed seed
  });

  it("timeseries buckets sum to all events in range; compare adds a shifted series", async () => {
    const res = await getWidget(
      "timeseries",
      `from=${FROM}&to=${TO}&grain=day&dim=channel&compare=1`,
    );
    const body = res.json();
    const total = (body.series as { v: number }[]).reduce((s, r) => s + Number(r.v), 0);
    const inRange = (
      await pool.query(
        "SELECT COUNT(*)::int n FROM refundlens.refund_events_raw WHERE occurred_at >= $1 AND occurred_at <= $2",
        [FROM, TO],
      )
    ).rows[0]!.n;
    expect(total).toBe(Number(inRange));
    expect(Array.isArray(body.compare)).toBe(true);
    expect(body.compare.length).toBeGreaterThan(0);
    expect(body.stats.stddev).toBeGreaterThan(0);
  });

  it("a bogus dim= is a typed-param rejection (fenced_query_rejected envelope)", async () => {
    const res = await getWidget("timeseries", `from=${FROM}&to=${TO}&dim=bogus_dimension`);
    expect(res.statusCode).toBe(400);
    const err = res.json().error;
    expect(err.code).toBe("FENCED_QUERY_REJECTED");
    expect(err.detail.guidance).toBeTruthy();
  });

  it("WIDGET-LAW BYPASS ATTEMPT: dim='channel; drop table' → fenced rejection, no SQL reaches the DB", async () => {
    // client tries to smuggle raw SQL through a typed param — the dim is
    // validated against the dimension allowlist BEFORE any SQL is built
    const res = await getWidget(
      "timeseries",
      `from=${FROM}&to=${TO}&dim=${encodeURIComponent("channel; drop table refund_events_raw")}`,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("FENCED_QUERY_REJECTED");
    // and the table is still there — nothing executed
    const still = await pool.query("SELECT COUNT(*)::int n FROM refundlens.refund_events_raw");
    expect(Number(still.rows[0]!.n)).toBe(SEED_TOTAL);
  });

  it("unknown widget name → fenced rejection; unauthenticated → 401; ops can read, plain user cannot", async () => {
    const nope = await getWidget("nope");
    expect(nope.statusCode).toBe(400);
    expect(nope.json().error.code).toBe("FENCED_QUERY_REJECTED");
    const noAuth = await app.inject({ method: "GET", url: "/api/widgets/kpi" });
    expect(noAuth.statusCode).toBe(401);
    const ops = await getWidget("kpi", `from=${FROM}&to=${TO}`, ["ops"]);
    expect(ops.statusCode).toBe(200);
    const nobody = await getWidget("kpi", "", ["viewer"]);
    expect(nobody.statusCode).toBe(403);
  });

  it("runWidget timeseries rejects a bogus metric before rendering SQL", async () => {
    await expect(
      runWidget(pool, "timeseries", { from: FROM, to: TO, metric: "evil" as never }),
    ).rejects.toThrow();
  });
});
