import type { Queryable } from "./migrations.js";

export interface PageOptions {
  table: string;
  /** keyset column — must be indexed, unique, monotonic */
  orderBy?: string;
  cursor?: string | number;
  limit?: number;
  direction?: "asc" | "desc";
}

export interface Page<T = Record<string, unknown>> {
  rows: T[];
  nextCursor: string | number | null;
}

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Keyset (cursor) pagination. Fetches limit+1 rows to compute the next
 * cursor, so inserts ahead of the cursor never cause dupes or skips —
 * unlike OFFSET.
 */
export async function paginate<T = Record<string, unknown>>(
  db: Queryable,
  opts: PageOptions,
): Promise<Page<T>> {
  const orderBy = opts.orderBy ?? "id";
  const limit = opts.limit ?? 50;
  const direction = opts.direction ?? "asc";
  for (const ident of [opts.table, orderBy]) {
    if (!IDENT.test(ident)) {
      throw new Error(`paginate: unsafe identifier "${ident}"`);
    }
  }
  const cmp = direction === "asc" ? ">" : "<";
  const params: unknown[] = [];
  let where = "";
  if (opts.cursor !== undefined) {
    params.push(opts.cursor);
    where = `WHERE ${orderBy} ${cmp} $1`;
  }
  params.push(limit + 1);
  const res = (await db.query(
    `SELECT * FROM ${opts.table} ${where} ORDER BY ${orderBy} ${direction} LIMIT $${params.length}`,
    params,
  )) as { rows: (T & Record<string, unknown>)[] };

  const rows = res.rows.slice(0, limit);
  const nextCursor =
    res.rows.length > limit && rows.length > 0
      ? (rows[rows.length - 1]![orderBy] as string | number)
      : null;
  return { rows, nextCursor };
}
