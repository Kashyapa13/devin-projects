/**
 * docs-lint — docs contract §3: a PR that changes behavior updates the
 * matching doc section in the SAME PR. Behavior surface per app:
 * api/, web/, db/, scripts/, Dockerfile, openapi.yaml, package.json.
 * Tests, docs/, e2e/ and markdown don't count as behavior.
 *
 * Escape hatch: a `docs-unchanged` label or a `docs-unchanged: <why>` line
 * (≥40 chars of justification) in the PR body — machine-checked, never
 * the blank phrase alone.
 */
import { changedFiles, diffRange, fail, ok, prEvent, realApps } from "./lib.js";

const BEHAVIOR = /^apps\/(?!_)[^/]+\/(api|web|db|scripts)\/|^apps\/(?!_)[^/]+\/(openapi\.yaml|Dockerfile|package\.json)$/;
const DOC = /^apps\/(?!_)[^/]+\/docs\/.*\.md$/;

const { base, head } = diffRange();
const changed = changedFiles(base, head);
const ev = prEvent();

const exempt = ev.labels.includes("docs-unchanged") ||
  /docs-unchanged\s*:\s*\S.{39,}/i.test(ev.body);

const dirty = new Set<string>();
for (const f of changed) {
  if (!BEHAVIOR.test(f)) continue;
  const app = f.split("/")[1]!;
  const docChanged = changed.some(
    (d) => DOC.test(d) && d.split("/")[1] === app,
  );
  if (!docChanged) dirty.add(app);
}

if (dirty.size > 0 && !exempt) {
  fail(
    `docs-lint: code changed under ${[...dirty]
      .map((a) => `apps/${a}`)
      .join(", ")} without a docs/ update. ` +
      `Update the matching doc section in this PR, add the docs-unchanged label, ` +
      `or write 'docs-unchanged: <reason>' (≥40 chars) in the PR body.`,
  );
}
if (dirty.size > 0) {
  ok(
    `docs-lint: ${[...dirty].join(", ")} changed but PR carries a docs-unchanged exemption`,
  );
} else {
  ok(`docs-lint: docs contract satisfied (${changed.length} files in range)`);
}
