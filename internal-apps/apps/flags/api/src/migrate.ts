import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMigrations, migrationRunner } from "@company/db";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(here, "..", "db", "migrations"), // flat dist/ layout
  join(here, "..", "..", "..", "db", "migrations"), // dist/api/src layout
  join(process.cwd(), "db", "migrations"), // app-root cwd
];
const dir = candidates.find((p) => existsSync(p));
if (!dir) {
  console.error(`migrations dir not found; checked: ${candidates.join(", ")}`);
  process.exit(1);
}

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
