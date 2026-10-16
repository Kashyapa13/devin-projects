import pg from "pg";
import type { APIRequestContext } from "@playwright/test";

/**
 * Deterministic seed enforcement: hard-delete suite-created `demo-e2e-*`
 * rows (live AND tombstoned — a deleted row still holds its (key,env)
 * unique slot) plus their audit rows, so each spec starts from the
 * flags-seed-v1 baseline regardless of earlier runs or sibling projects.
 */
export async function purgeE2eFlags(keys: string[]) {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL required for e2e flag purge");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(
      `DELETE FROM flag_audit_events WHERE flag_id IN
         (SELECT id FROM flags WHERE key = ANY($1))`,
      [keys],
    );
    await db.query(`DELETE FROM flags WHERE key = ANY($1)`, [keys]);
  } finally {
    await db.end();
  }
}

/**
 * flags-seed-v1 canonical rows — restores targeting AND undeletes in one
 * upsert, so a spec can never inherit a flipped/tombstoned seed row from a
 * failed sibling run. Mirrors scripts/seed.ts exactly; keep in sync.
 */
const SEED: [key: string, env: string, targeting: object][] = [
  ["demo-hero", "dev", { default_enabled: true }],
  ["demo-hero", "prod", { default_enabled: false }],
  ["demo-new-nav", "dev", { default_enabled: false }],
  ["demo-checkout-v2", "staging", { enabled_if: { bucket_lt: 25 } }],
];

export async function resetSeedFlags(request?: APIRequestContext) {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL required for e2e seed reset");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const [key, env, targeting] of SEED)
      await db.query(
        `INSERT INTO flags (key, env, targeting) VALUES ($1,$2,$3)
         ON CONFLICT (key, env)
         DO UPDATE SET targeting = EXCLUDED.targeting, deleted = false`,
        [key, env, JSON.stringify(targeting)],
      );
  } finally {
    await db.end();
  }
  // The API's SwrCache holds each key's rows for 30s — a DB-level reset can
  // be invisible to /api/flags/evaluate for up to TTL. Any successful
  // mutation invalidates the whole cache, so no-op-PUT demo-new-nav/dev.
  if (request) {
    const list = await (await request.get("/api/flags")).json();
    const row = list.flags.find(
      (f: any) => f.key === "demo-new-nav" && f.env === "dev",
    );
    if (row)
      await request.put(`/api/flags/${row.id}`, {
        headers: { "x-demo-role": "flag_editor", "x-demo-actor": "e2e-seed" },
        data: { targeting: { default_enabled: false } },
      });
  }
}
