/**
 * schema-drift — schema truth lives ONLY in db/migrations (docs contract §2).
 * Two checks per real app:
 *   1) diff check: a migration file changed ⇒ the app's docs/LLD.md changed
 *      in the same range (schema change without its LLD update = drift).
 *   2) content check: every CREATE TABLE / INDEX / ALTER TABLE identifier in
 *      the app's migrations must appear in docs/LLD.md (commentary section).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { changedFiles, diffRange, fail, MONOREPO_DIR, ok, realApps } from "./lib.js";

const { base, head } = diffRange();
const changed = changedFiles(base, head);
const problems: string[] = [];

const DDL_NAME =
  /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|UNIQUE\s+INDEX|INDEX)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-zA-Z_][\w]*)/gi;
const ALTER_NAME = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][\w]*)/gi;

for (const app of realApps()) {
  const dir = join(MONOREPO_DIR, "apps", app);
  const migDir = join(dir, "db", "migrations");
  const lldPath = join(dir, "docs", "LLD.md");
  if (!existsSync(migDir)) continue;
  if (!existsSync(lldPath)) {
    problems.push(`apps/${app}: migrations exist but docs/LLD.md is missing`);
    continue;
  }
  const lld = readFileSync(lldPath, "utf8");

  // (1) diff check
  const migChanged = changed.some((f) =>
    f.startsWith(`apps/${app}/db/migrations/`),
  );
  const lldChanged = changed.some(
    (f) => f === `apps/${app}/docs/LLD.md`,
  );
  if (migChanged && !lldChanged) {
    problems.push(
      `apps/${app}: db/migrations changed without a docs/LLD.md update in the same PR (docs contract §2)`,
    );
  }

  // (2) content check
  const missing = new Set<string>();
  for (const file of readdirSync(migDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(migDir, file), "utf8");
    for (const re of [DDL_NAME, ALTER_NAME]) {
      re.lastIndex = 0;
      for (let m = re.exec(sql); m; m = re.exec(sql)) {
        const name = m[1]!;
        if (!new RegExp(`\\b${name}\\b`).test(lld)) missing.add(name);
      }
    }
  }
  if (missing.size > 0) {
    problems.push(
      `apps/${app}: migrations define [${[...missing].join(", ")}] not mentioned in docs/LLD.md`,
    );
  }
}

if (problems.length > 0) {
  fail(`schema-drift: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
}
ok(`schema-drift: migrations ↔ LLD in sync (${realApps().length} app(s))`);
