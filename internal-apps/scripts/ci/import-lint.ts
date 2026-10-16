#!/usr/bin/env tsx
/**
 * import-lint — enforces dependency law (AGENTS.md §4, ADR-0003):
 *
 *   platform/** imports NOTHING from apps/** (and nothing app-specific)
 *   apps/<a>/** never imports apps/<b>/**
 *
 * Violations print file:line + rule and fail the build.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_DIRS = ["platform", "apps"];
const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", "coverage"]);

const IMPORT_RE =
  /(?:import|export)\s+[^'"]*?\bfrom\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export interface Violation {
  file: string;
  line: number;
  specifier: string;
  rule: "platform->apps" | "app->app" | "motion-outside-ui";
}

/** ADR-0014: ONE motion library, primitives in platform-ui ONLY. */
const UI_PKG = "platform/packages/ui/";
const MOTION_SPECS = /^(motion|framer-motion|react-spring|@use-gesture\/)/;

/** app directory names are reserved as bare specifiers */
function appNames(root = ROOT): Set<string> {
  try {
    return new Set(
      readdirSync(join(root, "apps")).filter((d) =>
        statSync(join(root, "apps", d)).isDirectory(),
      ),
    );
  } catch {
    return new Set();
  }
}

export function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.has(full.slice(full.lastIndexOf("."))))
      yield full;
  }
}

function specifiersOf(content: string): { spec: string; line: number }[] {
  const out: { spec: string; line: number }[] = [];
  const lines = content.split("\n");
  lines.forEach((text, i) => {
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec) out.push({ spec, line: i + 1 });
    }
  });
  return out;
}

export function checkFile(
  absPath: string,
  content: string,
  apps: Set<string>,
): Violation[] {
  const rel = relative(ROOT, absPath).split(sep).join("/");
  const inPlatform = rel.startsWith("platform/");
  const appMatch = rel.match(/^apps\/([^/]+)\//);
  const violations: Violation[] = [];

  for (const { spec, line } of specifiersOf(content)) {
    let resolvedRel: string | null = null;
    if (spec.startsWith(".")) {
      resolvedRel = normalize(join(dirname(rel), spec))
        .split(sep)
        .join("/");
    } else if (spec.startsWith("apps/")) {
      resolvedRel = spec;
    } else if (apps.has(spec.split("/")[0]!)) {
      // bare specifier naming an app directory — app-specific import
      resolvedRel = `apps/${spec}`;
    }

    if (inPlatform && resolvedRel?.startsWith("apps/")) {
      violations.push({
        file: rel,
        line,
        specifier: spec,
        rule: "platform->apps",
      });
    }
    if (
      !rel.startsWith(UI_PKG) &&
      !rel.startsWith("platform/packages/ui/tests/") &&
      MOTION_SPECS.test(spec)
    ) {
      violations.push({
        file: rel,
        line,
        specifier: spec,
        rule: "motion-outside-ui",
      });
    }
    if (appMatch && resolvedRel?.startsWith("apps/")) {
      const targetApp = resolvedRel.split("/")[1];
      if (targetApp && targetApp !== appMatch[1]) {
        violations.push({
          file: rel,
          line,
          specifier: spec,
          rule: "app->app",
        });
      }
    }
  }
  return violations;
}

export function run(root = ROOT): Violation[] {
  const apps = appNames(root);
  const violations: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(root, dir);
    try {
      statSync(abs);
    } catch {
      continue;
    }
    for (const file of walk(abs)) {
      violations.push(
        ...checkFile(file, readFileSync(file, "utf8"), apps),
      );
    }
  }
  return violations;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const violations = run();
  if (violations.length > 0) {
    console.error("import-lint: dependency law violations\n");
    for (const v of violations) {
      console.error(
        `  ${v.file}:${v.line}  ${v.rule}  import "${v.specifier}"`,
      );
    }
    console.error(
      `\n${violations.length} violation(s). platform → nothing app-specific; apps ↛ apps; motion lives in @company/ui only (AGENTS.md §4, ADR-0014).`,
    );
    process.exit(1);
  }
  console.log("import-lint: clean — dependency law holds");
}
