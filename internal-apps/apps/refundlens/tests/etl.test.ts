import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pgHarness, runSeeds, type PgHarness } from "@company/testing";
import { loadMigrations, migrationRunner } from "@company/db";
import { registry, SEED_TOTAL, SEED_PLAN } from "../scripts/seed.js";
import { runSync } from "../etl/sync.js";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

let pg: PgHarness;
let replica: Pool;
let rollup: Pool;

const n = async (db: Pool, sql: string, p?: unknown[]): Promise<number> =>
  Number(((await db.query(sql, p)) as { rows: { n: unknown }[] }).rows[0]!.n);

beforeAll(async () => {
  pg = await pgHarness("refundlens");
  rollup = new Pool({ connectionString: pg.dsn });
  rollup.on("error", () => {});
  replica = new Pool({ connectionString: pg.dsn });
  replica.on("error", () => {});
  const runner = migrationRunner(rollup);
  await runner.migrate(loadMigrations(MIGRATIONS));
  await runSeeds(rollup, registry, "refund-seed-v1");
});
afterAll(async () => {
  await replica.end();
  await rollup.end();
  await pg.stop();
});

describe("ETL — replica → rollup (fixed seed refund-seed-v1)", () => {
  it("syncs all source rows and writes a sync_runs row", async () => {
    const res = await runSync(replica, rollup, { sourceTable: "source.refund_events" });
    expect(res.status).toBe("success");
    expect(res.rows).toBe(SEED_TOTAL);
    expect(await n(rollup, "SELECT COUNT(*)::int n FROM refundlens.refund_events_raw")).toBe(SEED_TOTAL);
    expect(
      await n(rollup, "SELECT COUNT(*)::int n FROM refundlens.sync_runs WHERE status='success'"),
    ).toBe(1);
    expect(res.watermark).toBeTruthy();
  });

  it("agg_daily has the EXACT seeded numbers (assert 5,432 — not ≈5000)", async () => {
    const total = await n(rollup, "SELECT COALESCE(SUM(cnt),0)::bigint n FROM refundlens.agg_daily");
    expect(total).toBe(5432);
    // per-group exact numbers from the fixed seed plan
    for (const p of SEED_PLAN) {
      const got = await n(
        rollup,
        `SELECT COALESCE(SUM(cnt),0)::bigint n FROM refundlens.agg_daily
         WHERE channel=$1 AND merchant_segment=$2 AND reason_code=$3`,
        [p.channel, p.segment, p.reason],
      );
      expect(got, `${p.channel}/${p.segment}/${p.reason}`).toBe(p.count);
    }
  });

  it("re-run over the same window produces ZERO delta (idempotent)", async () => {
    const before = await n(rollup, "SELECT COUNT(*)::int n FROM refundlens.refund_events_raw");
    const aggBefore = await n(rollup, "SELECT COALESCE(SUM(cnt),0)::bigint n FROM refundlens.agg_daily");
    const res2 = await runSync(replica, rollup, { sourceTable: "source.refund_events" });
    expect(res2.status).toBe("success");
    expect(res2.rows).toBe(0); // watermark already covered the window
    expect(await n(rollup, "SELECT COUNT(*)::int n FROM refundlens.refund_events_raw")).toBe(before);
    expect(await n(rollup, "SELECT COALESCE(SUM(cnt),0)::bigint n FROM refundlens.agg_daily")).toBe(aggBefore);
    expect(
      await n(rollup, "SELECT COUNT(*)::int n FROM refundlens.sync_runs WHERE status='success'"),
    ).toBe(2); // every run recorded, even the zero-delta one
  });

  it("a failed run still writes its sync_runs row (status=error)", async () => {
    const broken = { query: () => Promise.reject(new Error("replica unreachable")) };
    const res = await runSync(broken, rollup, { sourceTable: "source.refund_events" });
    expect(res.status).toBe("error");
    expect(
      await n(rollup, "SELECT COUNT(*)::int n FROM refundlens.sync_runs WHERE status='error'"),
    ).toBeGreaterThanOrEqual(1);
  });
});
