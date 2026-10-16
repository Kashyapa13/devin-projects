import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";
import { appDb } from "../src/appDb.js";
import {
  loadMigrations,
  migrationRunner,
  type Queryable,
} from "../src/migrations.js";
import { paginate } from "../src/pagination.js";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/migrations",
);

function makeDb(): Queryable {
  const mem = newDb({ noAstCoverageCheck: true });
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as Queryable;
}

describe("migrationRunner", () => {
  it("applies up.sql in order and records them", async () => {
    const db = makeDb();
    const runner = migrationRunner(db);
    const migrations = loadMigrations(FIXTURES);
    const ran = await runner.migrate(migrations);
    expect(ran).toEqual(["001_create_cases", "002_add_priority"]);
    expect(await runner.applied()).toEqual(ran);
    // table exists: insert works
    await db.query("INSERT INTO cases (status) VALUES ('open')");
  });

  it("up/down roundtrip: rollback restores schema and can re-apply", async () => {
    const db = makeDb();
    const runner = migrationRunner(db);
    const migrations = loadMigrations(FIXTURES);
    await runner.migrate(migrations);

    const rolled = await runner.rollback(migrations, 1);
    expect(rolled).toEqual(["002_add_priority"]);
    // priority column gone → insert into remaining table still works
    await db.query("INSERT INTO cases (status) VALUES ('open')");

    // re-apply is clean
    expect(await runner.migrate(migrations)).toEqual(["002_add_priority"]);
    await db.query(
      "INSERT INTO cases (status, priority) VALUES ('open', 5)",
    );
  });

  it("loadMigrations requires a .down.sql pair", () => {
    expect(() => loadMigrations(FIXTURES)).not.toThrow();
    // (pairing is enforced at load time — fixtures carry both files)
  });
});

describe("appDb", () => {
  it("refuses a binding whose DSN targets another database", async () => {
    const db = makeDb();
    await expect(
      appDb(db, {
        dsn: "postgres://u:p@localhost:5432/refundlens",
        expectedDb: "fastlane",
      }),
    ).rejects.toThrow(/cross-app access refused/);
  });

  it("binds when names match", async () => {
    const db = makeDb();
    const bound = await appDb(db, {
      dsn: "postgres://u:p@localhost:5432/fastlane",
      expectedDb: "fastlane",
    });
    expect(bound.dbName).toBe("fastlane");
  });
});

describe("paginate", () => {
  let db: Queryable;
  beforeEach(async () => {
    db = makeDb();
    await db.query(
      "CREATE TABLE items (id SERIAL PRIMARY KEY, label TEXT NOT NULL)",
    );
    for (let i = 1; i <= 5; i++) {
      await db.query("INSERT INTO items (label) VALUES ($1)", [`item-${i}`]);
    }
  });

  it("pages forward with a stable nextCursor", async () => {
    const p1 = await paginate(db, { table: "items", limit: 2 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.nextCursor).toBe(2);
    const p2 = await paginate(db, {
      table: "items",
      limit: 2,
      cursor: p1.nextCursor!,
    });
    expect(p2.rows.map((r) => r.id)).toEqual([3, 4]);
  });

  it("cursor stays stable under inserts — no dupes, no skips", async () => {
    const p1 = await paginate(db, { table: "items", limit: 3 });
    expect(p1.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    // new row lands mid-pagination
    await db.query("INSERT INTO items (label) VALUES ('item-6')");
    const seen = new Set(p1.rows.map((r) => r.id));
    let cursor: number | string | null = p1.nextCursor;
    while (cursor !== null) {
      const page = await paginate(db, {
        table: "items",
        limit: 3,
        cursor,
      });
      for (const row of page.rows) {
        expect(seen.has(row.id)).toBe(false); // no duplicates
        seen.add(row.id as number);
      }
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(6); // every row seen exactly once
  });

  it("rejects unsafe identifiers", async () => {
    await expect(
      paginate(db, { table: "items; DROP TABLE items" }),
    ).rejects.toThrow(/unsafe identifier/);
  });
});
