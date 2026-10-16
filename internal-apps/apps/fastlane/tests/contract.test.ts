import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { buildOpenApi } from "../api/src/openapi.js";
import { REGISTRY } from "../api/src/routes.js";
import { TRANSITIONS } from "../api/src/statemachine.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("api-drift gate (§7.4 contract)", () => {
  it("committed openapi.yaml is byte-identical to REGISTRY output", () => {
    const committed = read("openapi.yaml");
    const generated = stringify(buildOpenApi());
    expect(committed).toBe(generated);
  });

  it("openapi parses and covers every registry endpoint", () => {
    const doc = parse(read("openapi.yaml"));
    for (const r of REGISTRY) {
      const m = r.method.toLowerCase();
      expect(doc.paths?.[r.path]?.[m], `${r.method} ${r.path}`).toBeTruthy();
    }
  });

  it("every registry path appears in docs/LLD.md (docs drift)", () => {
    const lld = read("docs/LLD.md");
    for (const r of REGISTRY) {
      const short = r.path.replace("/api/v1", "").replace("/cases/:id", "");
      // LLD names endpoints without the prefix — assert each action word exists
      const last = r.path.split("/").pop()!;
      expect(
        lld.includes(short.split("/")[1] ?? "") || lld.includes(last),
        `LLD missing ${r.path}`,
      ).toBeTruthy();
    }
  });

  it("statemachine edges match the migration's state_transitions seed (schema drift)", () => {
    const sql = read("db/migrations/0001_init.up.sql");
    for (const t of TRANSITIONS) {
      expect(
        sql,
        `migration missing edge ${t.from}->${t.to}`,
      ).toMatch(new RegExp(`\\('${t.from}',\\s*'${t.to}'`));
    }
    // and exactly five seeded edges — no shadow transitions
    const inserts = sql.match(/VALUES[\s\S]*?;/s)?.[0] ?? "";
    expect(
      (inserts.match(/\('(?:PENDING|IN_REVIEW|APPROVED|REJECTED|ESCALATED)',\s*'/g) ?? [])
        .length,
    ).toBe(5);
  });
});
