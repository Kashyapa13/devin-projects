/**
 * security-audit — `pnpm audit --audit-level=high` with a versioned,
 * per-advisory exception file. An advisory may be excepted ONLY when it
 * has no published fix (patched <0.0.0) and a written disposition +
 * review date lives in audit-exceptions.json — exceptions document risk,
 * they never hide fixable vulns (a fixable match still fails).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, MONOREPO_DIR, ok } from "./lib.js";

interface Advisory {
  module_name?: string;
  name?: string;
  severity?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
  url?: string;
}

const exceptionsPath = join(MONOREPO_DIR, "scripts/ci/audit-exceptions.json");
const exceptions = JSON.parse(
  readFileSync(exceptionsPath, "utf8"),
) as Record<string, { package: string; severity: string; why: string; review: string }>;

let auditJson: string;
try {
  auditJson = execSync("pnpm audit --json", {
    cwd: MONOREPO_DIR,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  auditJson = String((e as { stdout?: string }).stdout ?? "");
  if (!auditJson.trim().startsWith("{")) throw e;
}

const advisories = (
  (JSON.parse(auditJson) as { advisories?: Record<string, Advisory> })
    .advisories ?? {}
);
const HIGH = new Set(["high", "critical"]);

const problems: string[] = [];
const excepted: string[] = [];
for (const [id, a] of Object.entries(advisories)) {
  const ghsa =
    /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(a.url ?? "")?.[0] ?? id;
  const sev = (a.severity ?? "").toLowerCase();
  if (!HIGH.has(sev)) continue; // gate is --audit-level=high
  const fixable =
    a.patched_versions !== undefined &&
    !a.patched_versions.includes("<0.0.0");
  const ex = exceptions[ghsa];
  if (fixable || !ex) {
    problems.push(
      `${ghsa} ${a.module_name ?? a.name} (${sev}${fixable ? `, fix: ${a.patched_versions}` : ""})` +
        (fixable
          ? ""
          : " — unfixable; add an audit-exceptions.json entry with disposition"),
    );
  } else {
    excepted.push(`${ghsa} ${a.module_name} (${sev}) — excepted: ${ex.why.split(".")[0]}`);
  }
}

for (const line of excepted) console.log(`  ~ ${line}`);
if (problems.length > 0) {
  fail(`security-audit: ${problems.length} high/critical finding(s)\n- ${problems.join("\n- ")}`);
}
ok(
  `security-audit: clean at --audit-level=high` +
    (excepted.length ? ` (${excepted.length} documented unfixable exception(s))` : ""),
);
