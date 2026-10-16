import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Queryable {
  query(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: unknown[] } | unknown>;
}

/** One raw-SQL migration: `<name>.up.sql` + `<name>.down.sql`. */
export interface Migration {
  name: string;
  upSql: string;
  downSql: string;
}

const TRACKING_TABLE = "_migrations";

/**
 * Load `*.up.sql` / `*.down.sql` pairs from a migrations directory,
 * ordered by filename. Every .up.sql must have its .down.sql — the pair
 * is the unit.
 */
export function loadMigrations(dir: string): Migration[] {
  const files = readdirSync(dir);
  const ups = files.filter((f) => f.endsWith(".up.sql")).sort();
  return ups.map((up) => {
    const name = up.slice(0, -".up.sql".length);
    const down = `${name}.down.sql`;
    if (!files.includes(down)) {
      throw new Error(`migration ${name}: missing ${down}`);
    }
    return {
      name,
      upSql: readFileSync(join(dir, up), "utf8"),
      downSql: readFileSync(join(dir, down), "utf8"),
    };
  });
}

export interface MigrationRunner {
  applied(): Promise<string[]>;
  migrate(migrations: Migration[]): Promise<string[]>;
  rollback(migrations: Migration[], steps?: number): Promise<string[]>;
}

/**
 * Raw-SQL migration runner. Each migration applies inside its own
 * transaction; applied names are recorded in `_migrations`. No generated
 * SQL — files are executed verbatim (constitution: reviewed as raw SQL).
 */
export function migrationRunner(db: Queryable): MigrationRunner {
  async function ensureTable(): Promise<void> {
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
  }

  async function applied(): Promise<string[]> {
    await ensureTable();
    const res = (await db.query(
      `SELECT name FROM ${TRACKING_TABLE} ORDER BY name`,
    )) as { rows: { name: string }[] };
    return res.rows.map((r) => r.name);
  }

  async function inTx(work: () => Promise<void>): Promise<void> {
    await db.query("BEGIN");
    try {
      await work();
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  }

  return {
    applied,

    async migrate(migrations: Migration[]): Promise<string[]> {
      const done = new Set(await applied());
      const pending = migrations
        .filter((m) => !done.has(m.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      const ran: string[] = [];
      for (const m of pending) {
        await inTx(async () => {
          await db.query(m.upSql);
          await db.query(
            `INSERT INTO ${TRACKING_TABLE} (name) VALUES ($1)`,
            [m.name],
          );
        });
        ran.push(m.name);
      }
      return ran;
    },

    async rollback(
      migrations: Migration[],
      steps = 1,
    ): Promise<string[]> {
      const done = await applied();
      const byName = new Map(migrations.map((m) => [m.name, m]));
      const targets = done
        .filter((n) => byName.has(n))
        .sort()
        .reverse()
        .slice(0, steps);
      for (const name of targets) {
        const m = byName.get(name)!;
        await inTx(async () => {
          await db.query(m.downSql);
          await db.query(`DELETE FROM ${TRACKING_TABLE} WHERE name = $1`, [
            name,
          ]);
        });
      }
      return targets;
    },
  };
}
