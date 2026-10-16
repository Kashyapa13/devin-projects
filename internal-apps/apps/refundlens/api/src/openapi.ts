import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { REGISTRY } from "./routes.js";

/**
 * openapi.yaml is GENERATED from REGISTRY — the api-drift gate diffs the
 * committed file against this output (regenerate: pnpm openapi).
 */
export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, unknown> = {
    "/healthz": { get: { summary: "Liveness (platform-http)", responses: { "200": { description: "ok" } } } },
    "/readyz": { get: { summary: "Readiness (platform-http)", responses: { "200": { description: "ready" }, "503": { description: "not ready" } } } },
  };
  for (const r of REGISTRY) {
    const target =
      ((paths as Record<string, unknown>)[r.path] as Record<string, unknown> | undefined) ?? {};
    target[r.method.toLowerCase()] = {
      summary: r.summary,
      "x-roles": [...r.roles],
      responses: {
        "200": { description: "ok" },
        "400": { description: "envelope error" },
        "401": { description: "unauthenticated" },
        "403": { description: "forbidden" },
      },
    };
    paths[r.path] = target;
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "refundlens",
      version: "0.1.0",
      description:
        "Refunds answer service — contract derived from api/src/routes.ts REGISTRY; LLD section must match (contract test).",
    },
    paths,
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../openapi.yaml",
  );
  writeFileSync(out, stringify(buildOpenApi()));
  console.log(`wrote ${out}`);
}
