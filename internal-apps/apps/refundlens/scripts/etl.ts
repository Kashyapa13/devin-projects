import { fileURLToPath } from "node:url";
import { runSync } from "../etl/sync.js";

/**
 * `pnpm etl` — one scheduled sync: REPLICA_DSN (vault) → rollup store.
 * The replica and the rollup are DIFFERENT DSNs by law (AGENTS.md §2);
 * reading the primary = rejected PR.
 */
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
  try {
    const res = await runSync(replica, rollup, {
      sourceTable: process.env.SOURCE_TABLE ?? "refund_events",
    });
    console.log(JSON.stringify(res));
    if (res.status === "error") process.exitCode = 1; // failure alert hook
  } finally {
    await replica.end();
    await rollup.end();
  }
}
