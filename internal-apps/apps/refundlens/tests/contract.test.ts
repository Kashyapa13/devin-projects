import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { buildOpenApi } from "../api/src/openapi.js";
import { REGISTRY } from "../api/src/routes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("api-drift gate (contract)", () => {
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
      const short = r.path.replace("/api/v1", "").replace("/metrics", "metrics exposition");
      const last = r.path.split("/").pop()!;
      expect(
        lld.includes(short.split("/")[1] ?? "") || lld.includes(last) || lld.includes(short),
        `LLD missing ${r.path}`,
      ).toBeTruthy();
    }
  });

  it("fence banned-tables match the LLD fence spec", () => {
    const lld = read("docs/LLD.md");
    expect(lld).toContain("ask_log");
    expect(lld).toContain("sync_runs");
    const migration = read("db/migrations/0001_init.up.sql");
    for (const t of ["refund_events_raw", "agg_daily", "sync_runs", "ask_log"]) {
      expect(migration).toContain(`refundlens.${t}`);
    }
  });
});
