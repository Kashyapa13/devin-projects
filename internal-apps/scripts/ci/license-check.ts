/**
 * license-check — denylist gate over `pnpm licenses list --json`.
 * Denied: strong copyleft / non-commercial / source-available families.
 * Workspace packages (@company/*, @app/*) are private source, exempt.
 * A missing/UNKNOWN license on an EXTERNAL dep fails — investigate it.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, MONOREPO_DIR, ok } from "./lib.js";

const DENY =
  /(GPL-?\d|AGPL|LGPL-3|SSPL|OSL-3|EUPL|CPAL|CC-BY-NC|CC-BY-SA|BUSL-1\.1|Commons[ -]?Clause|Elastic-2|Hippocratic)/i;

/** name → verified license, for packages pnpm misreports as Unknown/empty. */
const allowlistPath = join(MONOREPO_DIR, "scripts/ci/license-allowlist.json");
const ALLOWLIST: Record<string, string> = existsSync(allowlistPath)
  ? (JSON.parse(readFileSync(allowlistPath, "utf8")) as Record<string, string>)
  : {};

interface LicenseEntry {
  name?: string;
  versions?: string[];
  license?: string;
  licenses?: string;
  author?: string;
}

function pkgLicenses(): { name: string; license: string }[] {
  // --no-optional: platform-only optional deps (e.g. @napi-rs/*-gnu) have
  // no index file on this arch and break `pnpm licenses list` resolution.
  const raw = execSync("pnpm licenses list --json --no-optional", {
    cwd: MONOREPO_DIR,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw) as
    | Record<string, LicenseEntry[]>
    | LicenseEntry[];
  const out: { name: string; license: string }[] = [];
  if (Array.isArray(parsed)) {
    for (const e of parsed) {
      out.push({
        name: e.name ?? "?",
        license: e.license ?? e.licenses ?? "UNKNOWN",
      });
    }
  } else {
    for (const [license, entries] of Object.entries(parsed)) {
      for (const e of entries) {
        out.push({ name: e.name ?? "?", license: e.license ?? license });
      }
    }
  }
  return out;
}

const seen = new Map<string, string>();
for (const { name, license } of pkgLicenses()) {
  if (name.startsWith("@company/") || name.startsWith("@app/")) continue;
  const effective =
    /^(unknown)?$/i.test(license.trim()) && ALLOWLIST[name]
      ? ALLOWLIST[name]!
      : license || "UNKNOWN";
  const prev = seen.get(name);
  if (!prev || /^unknown$/i.test(prev)) seen.set(name, effective);
}

const denied = [...seen].filter(([, l]) => DENY.test(l));
const unknown = [...seen].filter(([, l]) => /^unknown$/i.test(l));
const problems = [
  ...denied.map(([n, l]) => `${n}: denied license ${l}`),
  ...unknown.map(([n]) => `${n}: license UNKNOWN — verify manually`),
];

if (problems.length > 0) {
  fail(`license-check: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
}
ok(`license-check: ${seen.size} external packages, allowlist clean`);
