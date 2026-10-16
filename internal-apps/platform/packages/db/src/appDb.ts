import type { Queryable } from "./migrations.js";

export interface AppDb extends Queryable {
  readonly dbName: string;
}

/** Extract the database name from a postgres:// DSN. */
export function dbNameFromDsn(dsn: string): string {
  const url = new URL(dsn);
  const name = url.pathname.replace(/^\//, "");
  if (!name) throw new Error(`appDb: DSN has no database name: ${dsn}`);
  return name;
}

/**
 * Bind a Queryable to ONE application database (law §5 — per-app DBs,
 * never shared). Construction fails fast if the DSN's database doesn't
 * match `expectedDb`, and optionally verifies `current_database()` on
 * the server when `verify` is set.
 */
export async function appDb(
  db: Queryable,
  opts: { dsn: string; expectedDb: string; verify?: boolean },
): Promise<AppDb> {
  const dbName = dbNameFromDsn(opts.dsn);
  if (dbName !== opts.expectedDb) {
    throw new Error(
      `appDb: DSN targets "${dbName}", expected "${opts.expectedDb}" — cross-app access refused`,
    );
  }
  if (opts.verify) {
    const res = (await db.query("SELECT current_database() AS db")) as {
      rows: { db: string }[];
    };
    const actual = res.rows[0]?.db;
    if (actual !== opts.expectedDb) {
      throw new Error(
        `appDb: server reports "${actual}", expected "${opts.expectedDb}" — cross-app access refused`,
      );
    }
  }
  return { dbName, query: (text, params) => db.query(text, params) };
}
