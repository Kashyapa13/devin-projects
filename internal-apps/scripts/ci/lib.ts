/** Shared helpers for scripts/ci — no third-party deps (tsx-run, root context). */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** internal-apps root, wherever git puts it in the checkout. */
export const MONOREPO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
/** Prefix git emits for paths inside the monorepo (root checkout may be the repo root). */
export const MONO_PREFIX = `${MONOREPO_DIR.split("/").pop()}/`;

export interface PrEvent {
  title: string;
  body: string;
  labels: string[];
}

/** PR title/body/labels from $GITHUB_EVENT_PATH; {} when not in Actions. */
export function prEvent(eventPath = process.env.GITHUB_EVENT_PATH): PrEvent {
  if (!eventPath || !existsSync(eventPath)) {
    return { title: "", body: "", labels: [] };
  }
  const ev = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: { title?: string; body?: string | null };
    label?: { name?: string };
    labels?: { name?: string }[];
  };
  const pr = ev.pull_request ?? {};
  const labels = (ev.pull_request as { labels?: { name?: string }[] } | undefined)
    ?.labels ?? [];
  return {
    title: pr.title ?? "",
    body: pr.body ?? "",
    labels: labels
      .map((l) => l.name)
      .filter((n): n is string => typeof n === "string"),
  };
}

/**
 * Files changed base..head, relative to the monorepo root
 * (paths outside the monorepo are dropped).
 */
export function changedFiles(base: string, head: string): string[] {
  const out = execSync(`git diff --name-only ${base}...${head}`, {
    cwd: MONOREPO_DIR,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((f) => (f.startsWith(MONO_PREFIX) ? f.slice(MONO_PREFIX.length) : f))
    .filter((f) => !f.includes("..") && !f.startsWith("../"));
}

/** BASE_SHA/HEAD_SHA env or argv --base/--head, falling back to HEAD^..HEAD. */
export function diffRange(argv = process.argv.slice(2)): {
  base: string;
  head: string;
} {
  const arg = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base =
    arg("--base") ?? process.env.BASE_SHA ?? process.env.GITHUB_BASE_SHA;
  const head =
    arg("--head") ?? process.env.HEAD_SHA ?? process.env.GITHUB_SHA;
  return { base: base ?? "HEAD^", head: head ?? "HEAD" };
}

/** App dir names under apps/ that are real (built) apps — excludes _-prefixed. */
export function realApps(): string[] {
  return readdirSync(join(MONOREPO_DIR, "apps"), { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith("_") &&
        existsSync(join(MONOREPO_DIR, "apps", d.name, "package.json")),
    )
    .map((d) => d.name)
    .sort();
}

export function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

export function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}
