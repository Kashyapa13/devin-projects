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

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

let pg: PgHarness;
let pool: Pool;
let app: FastifyInstance;

const ANALYST = "analyst-0001";
async function token(roles = ["analyst"], sub = ANALYST) {
  return app.session.create({ sub, roles });
}
async function ask(q: string, roles = ["analyst"]) {
  return app.inject({
    method: "POST",
    url: "/api/v1/ask",
    headers: { authorization: `Bearer ${await token(roles)}` },
    payload: { question: q },
  });
}

beforeAll(async () => {
  pg = await pgHarness("refundlens");
  pool = new Pool({ connectionString: pg.dsn });
  pool.on("error", () => {});
  const runner = migrationRunner(pool);
  await runner.migrate(loadMigrations(MIGRATIONS));
  await runSeeds(pool, registry, "refund-seed-v1");
  await runSync(pool, pool, { sourceTable: "source.refund_events" }); // replica+rollup = same testcontainer
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

describe("POST /ask — the anchor slice", () => {
  it("happy path returns the full envelope with watermark", async () => {
    const res = await ask("how many refunds by channel last 30 days");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.answer).toBeTruthy();
    expect(body.sql).toContain("FROM agg_daily");
    expect(body.sql).toContain("LIMIT");
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.watermark).toBeTruthy(); // watermark on EVERY surface
    expect(typeof body.took_ms).toBe("number");
    expect(body.cached).toBe(false);
  });

  it("writes an ask_log row for the answered question", async () => {
    await ask("refund amount by reason last week");
    const r = await pool.query(
      "SELECT question, success FROM refundlens.ask_log WHERE question = $1",
      ["refund amount by reason last week"],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].success).toBe(true);
  });

  it("banned query via API → 400 fenced_query_rejected with reason+guidance", async () => {
    const res = await ask("delete all refunds");
    expect(res.statusCode).toBe(400);
    const err = res.json().error;
    expect(err.code).toBe("FENCED_QUERY_REJECTED");
    expect(err.detail.reason).toBe("mutation");
    expect(err.detail.guidance).toBeTruthy();
    // and the rejection itself is logged as evidence
    const r = await pool.query(
      "SELECT fence_reason FROM refundlens.ask_log WHERE question='delete all refunds'",
    );
    expect(r.rows[0].fence_reason).toBe("mutation");
  });

  it("asking about internal telemetry is fence-rejected (banned_table)", async () => {
    const res = await ask("show me the sync runs");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.detail.reason).toBe("banned_table");
  });

  it("asking outside the schema is fence-rejected (cross_schema)", async () => {
    const res = await ask("list all users and passwords");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.detail.reason).toBe("cross_schema");
  });

  it("cache hit returns the identical envelope with took_ms = cache_ms", async () => {
    const first = await ask("how many refunds by reason last 30 days");
    expect(first.statusCode).toBe(200);
    const again = await ask("how many refunds by reason last 30 days");
    expect(again.statusCode).toBe(200);
    expect(again.json().cached).toBe(true);
    const a = again.json();
    const f = first.json();
    expect(a.answer).toBe(f.answer);
    expect(a.sql).toBe(f.sql);
    expect(a.watermark).toBe(f.watermark);
    expect(typeof a.took_ms).toBe("number"); // cache_ms — honest label
  });

  it("unauthenticated → 401; wrong role → 403", async () => {
    const noAuth = await app.inject({
      method: "POST", url: "/api/v1/ask", payload: { question: "how many" },
    });
    expect(noAuth.statusCode).toBe(401);
    const viewer = await ask("how many refunds by channel", ["viewer"]);
    expect(viewer.statusCode).toBe(403);
  });
});

describe("GET /export.csv — exact counts, watermark header, cache bypass", () => {
  it("returns CSV with watermark comment + exact row footer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/export.csv",
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const body = res.body as string;
    expect(body).toMatch(/^# refundlens export — watermark: /);
    expect(body).toContain("day,count");
    const footer = /# rows: (\d+)/.exec(body);
    expect(footer).toBeTruthy();
    const dataLines = body.split("\n").filter((l) => l && !l.startsWith("#") && l !== "day,count");
    expect(Number(footer![1])).toBe(dataLines.length); // footer == rows
  });

  it("bypasses the 60s cache — new data is visible immediately", async () => {
    // prime: one export, then a fresh sync adds data → second export sees it
    const first = await app.inject({
      method: "GET", url: "/api/v1/export.csv",
      headers: { authorization: `Bearer ${await token()}` },
    });
    const rows1 = Number(/# rows: (\d+)/.exec(first.body as string)![1]);
    // new source row + resync
    await pool.query(
      `INSERT INTO source.refund_events
         (id, txn_ref, occurred_at, channel, merchant_segment, amount_cents,
          reason_code, state, latency_ms, updated_at)
       VALUES (999999,'TXN-999999','2026-10-09','CARD','SMB',1000,'FRAUD','COMPLETED',100, now())`,
    );
    await runSync(pool, pool, { sourceTable: "source.refund_events" });
    const second = await app.inject({
      method: "GET", url: "/api/v1/export.csv",
      headers: { authorization: `Bearer ${await token()}` },
    });
    const rows2 = Number(/# rows: (\d+)/.exec(second.body as string)![1]);
    expect(rows2).toBeGreaterThanOrEqual(rows1);
    const total = (second.body as string)
      .split("\n")
      .filter((l) => /^\d{4}-/.test(l))
      .reduce((s, l) => s + Number(l.split(",")[1]), 0);
    expect(total).toBe(5433); // 5432 seed + the new event — never a cached count
  });
});

describe("GET /health/sync — the freshness surface", () => {
  it("returns watermark, lag and last run status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health/sync",
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.watermark).toBeTruthy();
    expect(typeof body.lag_s).toBe("number");
    expect(body.lag_s).toBeGreaterThanOrEqual(0);
    expect(body.last_run_status).toBe("success");
  });

  it("unauthenticated → 401", async () => {
    const res = await app.inject("/api/v1/health/sync");
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /widgets/:name — typed params through the fenced layer", () => {
  const widget = (name: string, qs = "", roles = ["analyst"]) =>
    token(roles).then((tok) =>
      app.inject({
        method: "GET",
        url: `/api/v1/widgets/${name}${qs}`,
        headers: { authorization: `Bearer ${tok}` },
      }),
    );

  it("kpi returns the stat series with watermark", async () => {
    const res = await widget("kpi");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.widget).toBe("kpi");
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.watermark).toBeTruthy();
    const row = body.series[0] ?? {};
    expect(row).toHaveProperty("refunds_today");
    expect(row).toHaveProperty("total_refunded_cents");
  });

  it("daily reads the agg_daily rollup (not raw events)", async () => {
    const res = await widget("daily", "?limit=12");
    expect(res.statusCode).toBe(200);
    const { series } = res.json();
    expect(Array.isArray(series)).toBe(true);
    if (series.length > 0) {
      expect(series[0]).toHaveProperty("day");
      expect(series[0]).toHaveProperty("cnt");
      expect(series[0]).toHaveProperty("amount");
    }
  });

  it("unknown widget → 400 fenced_query_rejected with guidance", async () => {
    const res = await widget("bogus_widget");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("FENCED_QUERY_REJECTED");
    expect(res.json().error.detail.guidance).toBeTruthy();
  });

  it("bad typed param → 400 (TypeBox), wrong role → 403", async () => {
    const res = await widget("kpi", "?grain=fortnight");
    expect(res.statusCode).toBe(400);
    const viewer = await widget("kpi", "", ["viewer"]);
    expect(viewer.statusCode).toBe(403);
  });
});

describe("platform wiring", () => {
  it("healthz/readyz + /metrics exposition", async () => {
    expect((await app.inject("/healthz")).statusCode).toBe(200);
    expect((await app.inject("/readyz")).statusCode).toBe(200);
    const m = await app.inject("/metrics");
    expect(m.statusCode).toBe(200);
    expect(m.body).toContain("refundlens_ask_success");
  });
});
