import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMigrations, migrationRunner } from "@company/db";

/** `pnpm migrate` — applies pending migrations, `pnpm migrate --down` rolls back the last batch. */
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "db",
    "migrations",
  );
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const runner = migrationRunner(pool);
    const migrations = loadMigrations(dir);
    if (process.argv.includes("--down")) {
      const rolled = await runner.rollback(migrations);
      console.log(`rolled back: ${rolled.join(", ") || "nothing"}`);
    } else {
      const applied = await runner.migrate(migrations);
      console.log(`applied: ${applied.join(", ") || "up to date"}`);
    }
  } finally {
    await pool.end();
  }
}
