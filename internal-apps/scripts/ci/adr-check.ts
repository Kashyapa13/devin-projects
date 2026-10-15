/**
 * adr-check — docs contract §4: architectural diffs carry an ADR.
 * platform/** changes require either a NEW docs/adr/NNNN-*.md in the diff
 * or an explicit ADR-NNNN citation in the PR body (amendment-by-new-ADR
 * stays the contract; a citation only covers "no decision changed" work
 * like comment fixes — reviewer's call, the gate just forces the cite).
 */
import { changedFiles, diffRange, fail, ok, prEvent } from "./lib.js";

const { base, head } = diffRange();
const changed = changedFiles(base, head);
const ev = prEvent();

const platformChanged = changed.some((f) => f.startsWith("platform/"));
if (!platformChanged) {
  ok("adr-check: no platform/ changes in range");
  process.exit(0);
}

const newAdr = changed.find((f) => /^docs\/adr\/\d{4}-[^/]+\.md$/.test(f));
const cited = /\bADR-\d{4}\b/i.test(`${ev.title}\n${ev.body}`);

if (!newAdr && !cited) {
  fail(
    `adr-check: platform/ changed without an ADR. Add docs/adr/NNNN-slug.md ` +
      `(Context / Options / Decision / Tradeoffs / Consequences) or cite the ` +
      `governing ADR-NNNN in the PR body.`,
  );
}
ok(
  newAdr
    ? `adr-check: platform change carries ${newAdr}`
    : `adr-check: platform change cites an ADR in the PR body`,
);
