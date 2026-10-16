# @company/db

Raw-SQL migrations, per-app DB binding, cursor pagination.

## API

- `loadMigrations(dir) → Migration[]` — ordered `NNN_slug.up.sql` /
  `NNN_slug.down.sql` pairs; a missing `.down.sql` fails the load.
- `migrationRunner(db)` — `migrate(migrations)` applies pending files in
  order, each in its own transaction, recorded in `_migrations`;
  `rollback(migrations, steps)` applies `.down.sql` newest-first.
- `appDb(db, {dsn, expectedDb, verify?})` — binds one app DB; throws on
  cross-app mismatch (`verify: true` also checks `current_database()`).
- `paginate(db, {table, orderBy?, cursor?, limit?, direction?})` — keyset
  pagination returning `{rows, nextCursor}`; fetches `limit+1` to detect
  the next page. Identifiers are whitelisted against SQL injection.

## Usage

```ts
import { loadMigrations, migrationRunner, appDb, paginate } from "@company/db";

const db = await appDb(pool, { dsn: process.env.DATABASE_URL!, expectedDb: "fastlane" });
await migrationRunner(db).migrate(loadMigrations("db/migrations"));
const page = await paginate(db, { table: "cases", cursor: req.query.cursor, limit: 50 });
```

Schema truth lives in `db/migrations` as reviewed raw SQL — never
generated (constitution). Tests run against `pg-mem` (in-memory Postgres);
integration harness for real PG is `@company/testing` → `pgHarness`.
