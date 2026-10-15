/**
 * api-drift — openapi.yaml is the contract; api/src/routes.ts REGISTRY is
 * the truth. Every implemented route must be documented and every
 * documented path must be implemented (or platform-inherent: healthz/readyz).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fail, MONOREPO_DIR, ok, realApps } from "./lib.js";

/** Routes every app gets from platform-http, never re-registered in REGISTRY. */
const PLATFORM_ROUTES = new Set(["GET /healthz", "GET /readyz"]);

const ROUTE_RE =
  /\{\s*method:\s*"([A-Z]+)"\s*,\s*path:\s*"([^"]+)"/g;
/** OpenAPI `paths:` block keys — two-space indented "/..." entries
 * (Fastify-style :param segments may contain colons; key ends at EOL ':'). */
const PATH_RE = /^ {2}(\/.*?):$/gm;
const METHOD_RE = /^ {4}(get|post|put|patch|delete|head|options)\s*:/gm;

const problems: string[] = [];

for (const app of realApps()) {
  const dir = join(MONOREPO_DIR, "apps", app);
  const routesPath = join(dir, "api", "src", "routes.ts");
  const specPath = join(dir, "openapi.yaml");
  const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";

  const documented = new Set<string>();
  if (spec.trim().length > 0) {
    if (!/^openapi:\s*\d/m.test(spec)) {
      problems.push(`apps/${app}: openapi.yaml has no 'openapi: <ver>' header`);
      continue;
    }
    const pathsBlock = spec.slice(spec.search(/^paths:/m));
    PATH_RE.lastIndex = 0;
    for (let m = PATH_RE.exec(pathsBlock); m; m = PATH_RE.exec(pathsBlock)) {
      const pathStart = m.index + m[0].length;
      const nextPath = pathsBlock.slice(pathStart).search(/^ {2}\//m);
      const segment =
        nextPath === -1
          ? pathsBlock.slice(pathStart)
          : pathsBlock.slice(pathStart, pathStart + nextPath);
      METHOD_RE.lastIndex = 0;
      let found = false;
      for (
        let mm = METHOD_RE.exec(segment);
        mm;
        mm = METHOD_RE.exec(segment)
      ) {
        documented.add(`${mm[1]!.toUpperCase()} ${m[1]}`);
        found = true;
      }
      if (!found) {
        problems.push(`apps/${app}: openapi path ${m[1]} declares no methods`);
      }
    }
  }

  if (!existsSync(routesPath)) {
    // Contract-only app (stub): openapi must stay empty until code lands.
    if (documented.size > 0) {
      problems.push(
        `apps/${app}: openapi documents ${documented.size} route(s) but api/src/routes.ts does not exist`,
      );
    }
    continue;
  }

  const src = readFileSync(routesPath, "utf8");
  const implemented = new Set<string>();
  ROUTE_RE.lastIndex = 0;
  for (let m = ROUTE_RE.exec(src); m; m = ROUTE_RE.exec(src)) {
    implemented.add(`${m[1]} ${m[2]}`);
  }

  for (const r of implemented) {
    if (!documented.has(r)) {
      problems.push(`apps/${app}: ${r} implemented but missing from openapi.yaml`);
    }
  }
  for (const d of documented) {
    if (!implemented.has(d) && !PLATFORM_ROUTES.has(d)) {
      problems.push(`apps/${app}: ${d} in openapi.yaml but not implemented`);
    }
  }

  // OpenAPI ↔ LLD (docs contract §3): the LLD's registry must name every
  // documented route — checked per-path on its distinguishing tail segment.
  const lldPath = join(dir, "docs", "LLD.md");
  if (existsSync(lldPath)) {
    const lld = readFileSync(lldPath, "utf8");
    for (const d of documented) {
      const path = d.split(" ")[1]!;
      if (PLATFORM_ROUTES.has(d)) continue;
      // distinguishing tail: last literal segment (route params start with ':')
      const tail = path
        .split("/")
        .filter(Boolean)
        .filter((s) => !s.startsWith(":"))
        .pop()!;
      if (!new RegExp(`\\b${tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lld)) {
        problems.push(
          `apps/${app}: ${d} missing from docs/LLD.md API registry (tail "${tail}")`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  fail(`api-drift: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
}
ok("api-drift: openapi ↔ REGISTRY in sync");
