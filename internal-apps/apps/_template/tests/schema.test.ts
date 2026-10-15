import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import {
  loadMigrations,
  migrationRunner,
  type Queryable,
} from "@company/db";
import { runSeeds } from "@company/testing";
import { registry } from "../scripts/seed.js";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

function makeDb(): Queryable {
  const mem = newDb({ noAstCoverageCheck: true });
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as Queryable;
}

describe("migrations + seeder (platform-db / platform-testing)", () => {
  it("init migration applies, seed writes 10 deterministic rows, down restores", async () => {
    const db = makeDb();
    const runner = migrationRunner(db);
    const migrations = loadMigrations(MIGRATIONS);
    expect(migrations.map((m) => m.name)).toEqual(["0001_init"]);

    await runner.migrate(migrations);
    await runSeeds(db, registry, "template-seed");
    const res = (await db.query(
      "SELECT COUNT(*)::int AS n FROM template_seed",
    )) as { rows: { n: number }[] };
    expect(res.rows[0]!.n).toBe(10);

    await runner.rollback(migrations, 1);
    await expect(db.query("SELECT 1 FROM template_seed")).rejects.toThrow();
  });
});
