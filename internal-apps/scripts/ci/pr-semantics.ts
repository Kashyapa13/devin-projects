/**
 * pr-semantics — the kit's own law, machine-enforced:
 *   title: ^(feat|fix|docs|test|chore|refactor|perf|ci|build|revert)(\(.+\))?!?:.+
 *   scope (when present): an app name or a platform package name — nothing else
 *   body: names the PR-promise it serves (LLD "Usage KPIs" section), OR a
 *         `docs-unchanged: <reason>` line with ≥40 chars of justification
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fail, MONOREPO_DIR, ok, prEvent } from "./lib.js";

const TITLE =
  /^(feat|fix|docs|test|chore|refactor|perf|ci|build|revert)(\(([^)]*)\))?!?:\s*.+/;

const scopes = [
  ...readdirSync(join(MONOREPO_DIR, "apps"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name),
  ...readdirSync(join(MONOREPO_DIR, "platform", "packages"), {
    withFileTypes: true,
  })
    .filter((d) => d.isDirectory())
    .map((d) => d.name),
].sort();

const { title, body } = prEvent();
const problems: string[] = [];

const m = TITLE.exec(title);
if (!title) {
  problems.push("no PR title in event payload (not a pull_request run?)");
} else if (!m) {
  problems.push(
    `title "${title}" does not match\n  ${TITLE.source}\n  example: feat(fastlane): add saved filters`,
  );
} else if (m[3] !== undefined && !scopes.includes(m[3])) {
  problems.push(
    `scope "${m[3]}" is not an app or platform package.\n  valid: ${scopes.join(", ")}\n  (repo-level work: omit the scope — "feat: …")`,
  );
}

const promise = /pr[- ]promise\s*:\s*\S.{9,}/i.test(body);
const docsUnchanged = /docs-unchanged\s*:\s*\S.{39,}/i.test(body);
if (!promise && !docsUnchanged) {
  problems.push(
    `body names no PR-promise. Reference the LLD "Usage KPIs" entry this PR ` +
      `serves as "PR-promise: <name>" — or justify "docs-unchanged: <reason>" (≥40 chars).`,
  );
}

if (problems.length > 0) {
  fail(`pr-semantics: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
}
ok(`pr-semantics: "${title}"`);
