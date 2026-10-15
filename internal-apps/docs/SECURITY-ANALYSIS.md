# SECURITY-ANALYSIS — RefundLens slice (TESTING.md §SECURITY)

Executed 2026-10-15 on the skeleton base. The fence is the crown jewel —
most of this page is its evidence.

## Command + output matrix

| Check | Command | Result |
| --- | --- | --- |
| Escape corpus (≥20 banned + injection) | `pnpm exec vitest run tests/fence-escape.test.ts` | **58/58 rejected** `fenced_query_rejected` — post-c1a55e8 the 7 former confirmed escapes (subquery/JOIN-tail) are closed and pinned green (OPEN-2 CLOSED) |
| Fence unit battery | `vitest run tests/fence.test.ts tests/ast.test.ts` | PASS — every banned construct class rejected; lexer quirks pinned |
| Route authz | `vitest run tests/routes.test.ts` (pre-existing) | PASS — 401 no-token, 403 wrong-role, fenced-rejection envelope |
| Error envelope golden | `vitest run tests/envelope.test.ts` | PASS — `{error:{code,message,detail?,req_id}}`; auth-path omits req_id (OPEN-5, platform-owned) |
| Dependency audit | `pnpm audit` | 1 high `braces` (stack-exhaustion ReDoS, dev-tooling transitive), 2 moderate (`uuid` bounds, `sprintf-js` DoS) — transitive dev deps, none in the fenced request path |
| License scan | `pnpm licenses ls --prod` | 157 MIT · 23 ISC · 17 Apache-2.0 · 15 BSD-3-Clause — zero copyleft |
| Secret scan | `grep -rInE "(secret|key|token|postgres://)" api/ web/ db/ tests/ scripts/ e2e/` | only labeled fixtures (`dev-session-secret-fixture-only`, `postgres:pg` local DSN); gitleaks/semgrep/trivy/syft not installed in this harness — flagged as environment gap, not waived |
| SBOM | `pnpm list -r --depth -1` | dependency tree enumerable from workspace; cyclonedx/SBOM tool not installed — environment gap |

## THREAT-MODEL top-5 → executed check mapping

| Threat (THREAT-MODEL rank) | Check | Outcome |
| --- | --- | --- |
| T1 — fence escape (NL→SQL reaches a write/other-schema path) | 51-case corpus `tests/fence-escape.test.ts` + AST lexer/parser suite `tests/ast.test.ts` | **PASS** — all 58 constructs rejected. Post-c1a55e8: subqueries parse recursively and every JOIN ref is schema/banned-checked; the 7 former confirmed escapes are green regression pins (OPEN-2 CLOSED) |
| T2 — cardholder/PII leakage through answers | hostile NL corpus (`list all users and passwords`, `give me customer cards`, `dump the pan numbers`) → every question emits fenced SQL; schema allowlist pins `refundlens` | PASS — rejected `cross_schema`/`mutation`. With T1 closed, both NL-path and crafted-SQL paths to off-schema reads are fenced |
| T3 — replica/rollup overload (unbounded scans, no LIMIT) | LIMIT edge table (`tests/boundary.test.ts`): absent→`no_limit`, ALL→`no_limit`, >5000→`limit_over_cap`, non-literal→`parse_failure`; EXPLAIN cost cap `tests/executor.test.ts` | PASS |
| T4 — watermark suppression / staleness hidden from the user | `tests/boundary.test.ts` watermark edges (null→nulls surface, future→lag clamps 0, error→status surfaces); envelope UT + FT `data as of` visible | PASS — no watermark = impossible by construction |
| T5 — export abuse / cache poisoning (stale or rounded counts) | `tests/service.test.ts` export path: bypasses cache, footer `# rows:` equals data rows; `e2e/export-and-catalog.spec.ts` asserts watermark comment + exact count over the API | PASS |

## Findings carried (triage)

| Sev | Finding | Status |
| --- | --- | --- |
| P1 | OPEN-2 fence subquery/JOIN-tail blind spot — 7 probes accepted | **CLOSED upstream c1a55e8** — recursive subquery AST + every JOIN ref; escape corpus now 58/58 rejected, green pins remain as regression cover |
| P1 | OPEN-3 widget allowlist predates live-tier tables — monitors_panel/sync_health can never run | **CLOSED upstream** — allowlist extended; green pins in `tests/widgets-render.test.ts` |
| P1 | OPEN-4 `filtersOf` silently drops `field=value` filters | **CLOSED upstream c1a55e8** — filters bind as typed params; green pin in `tests/nl.test.ts` |
| P2 | OPEN-5 auth-path envelopes omit `req_id` | open — platform-owned |
| P3 | OPEN-6 lexer `''` not collapsed | open — fail-closed quirk |
| P3 | OPEN-7 rate phrasing renders the count template (semantic collision) | open — new finding filed post-c1a55e8 |
| info | 1 high + 2 moderate transitive dev-dep advisories | open — none in the fenced request path |

All three P1s were closed by the feature lane upstream (c1a55e8 for OPEN-2/4,
allowlist extension for OPEN-3); the pins designed to flip on the fix now
run as permanent green regression cover — the loudest signal a tests-only
lane can send worked as intended.
