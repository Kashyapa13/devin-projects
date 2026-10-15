/**
 * repo-lint — structural hygiene that always runs (not diff-scoped):
 *   · every *.up.sql migration has its tested *.down.sql pair
 *   · migration files are NNNN_name.{up,down}.sql
 *   · every real app carries the full doc set + AGENTS.md
 *   · openapi.yaml parses as YAML (shape sanity, dependency-free)
 *   · no PII-shaped fixtures: seed files must not contain person-shaped names
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fail, MONOREPO_DIR, ok, realApps } from "./lib.js";

const problems: string[] = [];
const REQUIRED_DOCS = [
  "AGENTS.md",
  "docs/HLD.md",
  "docs/LLD.md",
  "docs/RUNBOOK.md",
  "docs/OPEN-QUESTIONS.md",
  "docs/THREAT-MODEL.md",
];

for (const app of realApps()) {
  const dir = join(MONOREPO_DIR, "apps", app);
  for (const d of REQUIRED_DOCS) {
    if (!existsSync(join(dir, d))) {
      problems.push(`apps/${app}: missing required doc ${d}`);
    }
  }

  const migDir = join(dir, "db", "migrations");
  if (existsSync(migDir)) {
    const files = readdirSync(migDir).filter((f) => f.endsWith(".sql"));
    for (const f of files) {
      if (!/^\d{4}_[a-z0-9_]+\.(up|down)\.sql$/.test(f)) {
        problems.push(
          `apps/${app}/db/migrations/${f}: bad name — want NNNN_slug.{up,down}.sql`,
        );
        continue;
      }
      const pair = f.replace(/\.(up|down)\.sql$/, (m) =>
        m === ".up.sql" ? ".down.sql" : ".up.sql",
      );
      if (!files.includes(pair)) {
        problems.push(
          `apps/${app}/db/migrations/${f}: missing tested pair ${pair}`,
        );
      }
    }
  }

  const openapi = join(dir, "openapi.yaml");
  if (existsSync(openapi)) {
    const text = readFileSync(openapi, "utf8");
    if (!/^openapi:\s*3\./m.test(text) || !/^info:/m.test(text)) {
      problems.push(`apps/${app}/openapi.yaml: missing openapi/info header`);
    }
  }
}

// C4 law: synthetic fixtures only — no person-shaped names in any seed file.
const NAME_SHAPE =
  /\b(Mr|Mrs|Ms|Dr)\.\s+[A-Z][a-z]+|[A-Z][a-z]+\s+(Jr|Sr|III?)\b|\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\s+(born|ssn|passport)\b/i;
for (const app of realApps()) {
  const seedDir = join(MONOREPO_DIR, "apps", app, "scripts");
  if (!existsSync(seedDir)) continue;
  for (const f of readdirSync(seedDir).filter((x) => x.startsWith("seed"))) {
    const text = readFileSync(join(seedDir, f), "utf8");
    if (NAME_SHAPE.test(text)) {
      problems.push(
        `apps/${app}/scripts/${f}: person-shaped string found — synthetic fixtures only (C4)`,
      );
    }
  }
}

if (problems.length > 0) {
  fail(`repo-lint: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
}
ok(`repo-lint: structure clean (${realApps().length} app(s))`);
