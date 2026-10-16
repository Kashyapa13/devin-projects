import { fileURLToPath } from "node:url";
import { defineSeeds, runSeeds } from "@company/testing";
import type { SeedDb } from "@company/testing";

/**
 * "refund-seed-v1" — the ONLY allowed fixture name (AGENTS.md §7).
 * Deterministic source feed: exactly 5,432 refund events spread over
 * fixed dims so agg_daily assertions are EXACT (LLD test matrix).
 * All values synthetic — C3 tokenized-ref-shaped strings, no PII.
 */

const SOURCE_DDL = `
CREATE SCHEMA IF NOT EXISTS source;
CREATE TABLE IF NOT EXISTS source.refund_events (
  id bigint PRIMARY KEY,
  txn_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  channel text NOT NULL,
  merchant_segment text NOT NULL,
  amount_cents bigint NOT NULL,
  reason_code text NOT NULL,
  state text NOT NULL,
  latency_ms int,
  updated_at timestamptz NOT NULL
);`;

export interface SeedPlan {
  channel: string;
  segment: string;
  reason: string;
  count: number;
  dayOffset: number;
}

/**
 * The fixture's whole distribution — deterministic and summed so the
 * "assert 5,432" gate is a fact, not an approximation:
 * 2000 + 2000 + 1432 = 5432 across three channel groups.
 */
export const SEED_PLAN: SeedPlan[] = [
  { channel: "CARD", segment: "SMB", reason: "FRAUD", count: 1200, dayOffset: 2 },
  { channel: "CARD", segment: "ENT", reason: "DEFECT", count: 800, dayOffset: 5 },
  { channel: "ACH", segment: "SMB", reason: "DEFECT", count: 1100, dayOffset: 3 },
  { channel: "ACH", segment: "MID", reason: "CANCEL", count: 900, dayOffset: 8 },
  { channel: "WALLET", segment: "ENT", reason: "CANCEL", count: 900, dayOffset: 4 },
  { channel: "WALLET", segment: "MID", reason: "FRAUD", count: 532, dayOffset: 9 },
];
export const SEED_TOTAL = SEED_PLAN.reduce((s, p) => s + p.count, 0); // 5432

/**
 * Deterministic hour-of-day × day-of-week distribution (heatmap truth).
 * Events spread over ~44 weeks ending 2026-10-09; weekday-heavy DOW
 * cycle and a business-hours weight curve — the signature widget must
 * show a real pattern, not noise. Same id always yields the same slot.
 */
const HOUR_W = [1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 6, 6, 6, 6, 6, 6, 6, 4, 4, 4, 4, 2, 2, 2];
const HOUR_TOTAL = HOUR_W.reduce((a, b) => a + b, 0); // 78
const DOW_CYCLE = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6, 0]; // 10/12 weekday
function seedOccurredAt(id: number, jitterDays: number): string {
  // hour: weighted pick via cumulative weights
  let acc = (id * 31) % HOUR_TOTAL;
  let hour = 0;
  while (acc >= HOUR_W[hour]!) { acc -= HOUR_W[hour]!; hour++; }
  // dow: weighted weekday pick; week index spreads events back ~44w
  const dow = DOW_CYCLE[id % 12]!;
  const weekIdx = (id * 13) % 44;
  const end = Date.UTC(2026, 9, 9); // Friday 2026-10-09
  const endDow = new Date(end).getUTCDay();
  const dayMs =
    end - weekIdx * 7 * 86_400_000 - ((endDow - dow + 7) % 7) * 86_400_000 -
    jitterDays * 86_400_000;
  const d = new Date(dayMs);
  d.setUTCHours(hour, id % 60, (id * 7) % 60, 0);
  return d.toISOString();
}

async function seedSource(db: SeedDb): Promise<void> {
  await db.query(SOURCE_DDL);
  await db.query("DELETE FROM source.refund_events");
  let id = 1;
  for (const p of SEED_PLAN) {
    for (let i = 0; i < p.count; i++) {
      const amount = 500 + ((id * 37) % 20000); // deterministic cents
      const latency = 80 + ((id * 13) % 900);
      // deterministic, strictly increasing updated_at (the sync cursor
      // orders by (updated_at, id) — distinct values keep batches honest)
      const occurred = seedOccurredAt(id, p.dayOffset);
      const updated = new Date(Date.UTC(2026, 9, 9) + id * 1_000).toISOString();
      await db.query(
        `INSERT INTO source.refund_events
           (id, txn_ref, occurred_at, channel, merchant_segment,
            amount_cents, reason_code, state, latency_ms, updated_at)
         VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
        [
          id,
          `TXN-${String(id).padStart(6, "0")}`,
          occurred,
          p.channel,
          p.segment,
          amount,
          p.reason,
          ["COMPLETED", "PENDING", "FAILED"][id % 3]!,
          latency,
          updated,
        ],
      );
      id++;
    }
  }
}

export const registry = defineSeeds({
  "refund-seed-v1": async ({ db }) => {
    // fixture wipe — re-running reproduces the same world
    await db.query("DELETE FROM refundlens.ask_log").catch(() => undefined);
    await db.query("DELETE FROM refundlens.sync_runs").catch(() => undefined);
    await db.query("DELETE FROM refundlens.agg_daily").catch(() => undefined);
    await db.query("DELETE FROM refundlens.refund_events_raw").catch(() => undefined);
    await seedSource(db);
  },
});

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await runSeeds(pool, registry, "refund-seed-v1");
    console.log(`seeded: refund-seed-v1 (${SEED_TOTAL} source events)`);
  } finally {
    await pool.end();
  }
}
