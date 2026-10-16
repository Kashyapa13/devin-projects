import { fileURLToPath } from "node:url";
import { defineSeeds, runSeeds } from "@company/testing";

/**
 * Named deterministic seeds via @company/testing — 10 rows, always the
 * same 10 rows for the same seed value. Real apps name theirs
 * "<app>-seed-v1"; fixture data is synthetic ONLY (never PII-shaped).
 */
export const registry = defineSeeds({
  "template-seed": async ({ db }) => {
    for (let i = 0; i < 10; i++) {
      await db.query(
        "INSERT INTO template_seed (id, label) VALUES ($1, $2)",
        [i + 1, `seed-${String(i).padStart(2, "0")}`],
      );
    }
  },
});

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await runSeeds(pool, registry, process.argv[2] ?? "template-seed");
    console.log(`seeded: ${registry.names().join(", ")}`);
  } finally {
    await pool.end();
  }
}
