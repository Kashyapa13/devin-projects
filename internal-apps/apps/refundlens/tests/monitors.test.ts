import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pgHarness, runSeeds, type PgHarness } from "@company/testing";
import { loadMigrations, migrationRunner } from "@company/db";
import { registry } from "../scripts/seed.js";
import { runSync } from "../etl/sync.js";
import { evaluate } from "../monitors/evaluator.js";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

let pg: PgHarness;
let pool: Pool;

const rows = async (sql: string, p?: unknown[]) =>
  ((await pool.query(sql, p)) as { rows: Record<string, unknown>[] }).rows;

/** slackStub — the injectable collector (MONITOR_WEBHOOK for tests). */
const stubCalls: { monitor: string; text: string }[] = [];
const slackStub = async (msg: { monitor: { name: string }; text: string }) => {
  stubCalls.push({ monitor: msg.monitor.name, text: msg.text });
};

beforeAll(async () => {
  pg = await pgHarness("refundlens");
  pool = new Pool({ connectionString: pg.dsn });
  await migrationRunner(pool).migrate(loadMigrations(MIGRATIONS));
  await runSeeds(pool, registry, "refund-seed-v1");
  await runSync(pool, pool, { sourceTable: "source.refund_events" });
});
afterAll(async () => {
  await pool.end();
  await pg.stop();
});

describe("monitors-as-code (ADR-0016, F-11)", () => {
  it("a seeded spike fires the z-score monitors → monitor_events rows + slackStub ping", async () => {
    // ~700 refunds right now — a real spike vs the trailing distribution
    await pool.query(
      `INSERT INTO refundlens.refund_events_raw
        (id, txn_ref, occurred_at, channel, merchant_segment, amount_cents, reason_code, state, latency_ms, updated_at)
       SELECT 100000 + g, 'TXN-SPIKE-' || g, now(), 'POS','SMB', 2500,'FRAUD','COMPLETED', 120, now()
         FROM generate_series(1,700) g`,
    );

    const outcomes = await evaluate(pool, { notify: slackStub });
    const fired = outcomes.filter((o) => o.transitioned === "firing").map((o) => o.monitor);
    expect(fired).toContain("refund-rate-z");
    expect(fired).toContain("volume-anomaly");

    const events = await rows(
      `SELECT m.name, e.state, e.value FROM refundlens.monitor_events e
         JOIN refundlens.monitors m ON m.id = e.monitor_id
        WHERE m.name IN ('refund-rate-z','volume-anomaly') AND e.state='firing'`,
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(Number((events.find((e) => e.name === "refund-rate-z")!.value as { z: number }).z)).toBeGreaterThan(3);

    // slackStub got the pings (webhook never required)
    const names = stubCalls.map((c) => c.monitor);
    expect(names).toContain("refund-rate-z");
    expect(names).toContain("volume-anomaly");
    expect(stubCalls.find((c) => c.monitor === "refund-rate-z")!.text).toContain("firing");
  });

  it("a disabled monitor never fires even with firing data", async () => {
    // heartbeat-age would fire (we'll force the sync old) — disable it first
    await pool.query(
      `UPDATE refundlens.monitors SET enabled=false WHERE name='heartbeat-age'`,
    );
    await pool.query(
      `UPDATE refundlens.sync_runs SET finished_at = now() - interval '1 hour'`,
    );
    const outcomes = await evaluate(pool, { notify: slackStub });
    expect(outcomes.some((o) => o.monitor === "heartbeat-age")).toBe(false);
    const evs = await rows(
      `SELECT e.state FROM refundlens.monitor_events e
         JOIN refundlens.monitors m ON m.id = e.monitor_id
        WHERE m.name='heartbeat-age'`,
    );
    expect(evs.length).toBe(0); // never evaluated, never fired
    await pool.query(`UPDATE refundlens.monitors SET enabled=true WHERE name='heartbeat-age'`);
  });

  it("a monitor transitioning back to ok writes state='resolved' + resolved ping", async () => {
    // refund-rate-z is 'firing' from the spike test; delete the spike → ok
    await pool.query(`DELETE FROM refundlens.refund_events_raw WHERE id >= 100000`);
    const before = stubCalls.length;
    const outcomes = await evaluate(pool, { notify: slackStub });
    const rz = outcomes.find((o) => o.monitor === "refund-rate-z");
    expect(rz?.firing).toBe(false);
    expect(rz?.transitioned).toBe("resolved");
    const evs = await rows(
      `SELECT e.state FROM refundlens.monitor_events e
         JOIN refundlens.monitors m ON m.id = e.monitor_id
        WHERE m.name='refund-rate-z' ORDER BY e.fired_at`,
    );
    expect(evs.map((e) => e.state)).toEqual(["firing", "resolved"]);
    const resolvedPing = stubCalls.slice(before).find((c) => c.monitor === "refund-rate-z");
    expect(resolvedPing?.text).toContain("resolved");
  });

  it("steady-state writes NO extra events (incident log, not telemetry)", async () => {
    const count = async () =>
      Number((await rows("SELECT COUNT(*)::int n FROM refundlens.monitor_events"))[0]!.n);
    const before = await count();
    await evaluate(pool, { notify: slackStub }); // same state → silent
    expect(await count()).toBe(before);
  });
});
