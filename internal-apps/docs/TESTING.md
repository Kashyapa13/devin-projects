# TESTING.md — the testing charter (repo law)

This file is the testing contract for every app in the fleet. A PR that
violates it is a rejected PR.

## UT — unit tests

Pure-logic modules (statemachine, fence, evaluators, targeting bucketing):
**≥90% branches**. Routes/services: **≥80%**. Platform packages: **≥85%**
(the most-reviewed code).

- **Table-driven tests for EVERY matrix** — state transitions both
  directions + every invalid edge; fence banned constructs; RBAC role×route.
- **Boundary values**: risk_score 0/100/±1; reject reason 19/20 chars;
  LIMIT 499/500/5001; maker-checker threshold $4,999.99/$5,000/$5,000.01.
- **Property tests** where domains are numeric (bucketing: same input →
  same output + distribution sanity).
- **Golden tests** for the error envelope and audit-row shapes.
- **Test names read as spec sentences** — "rejects APPROVED→PENDING with 409".
- Stretch [target]: mutation score ≥70% on pure-logic modules.

## FT — functional tests

Playwright Page-Object suites covering **EVERY user-facing flow** (inventory
source = the §4.x feature specs; the ten demo-set features get first
priority; **BOTH motion modes** per the root Interaction law), not just
happy paths.

- **FastLane**: role×login, queue filter/sort/paginate,
  claim/approve/reject-with-reason/escalate/reopen, PII masked-by-default +
  audited reveal, full keyboard-only day, SLA chip past 48h, supervisor
  reassign/bulk-assign, auditor read-only, explicit empty/loading/error
  states.
- **RefundLens**: ask happy path + fenced-rejection UX, share-link
  determinism, the BI dashboard (KPI deltas, compare mode, cross-filter
  drill, heatmap render), live mode (simulated heartbeat → widgets re-bind
  without reload; stalled beat → amber/red states), monitors (definition
  tests + firing → Slack stub), export exact-count + watermark header,
  history.
- **Flags demo**: CRUD, env tabs, invalid targeting JSON rejected,
  typed-confirm delete, slider preview, /demo flip.
- Deterministic seed per suite; every FT tagged with the PR-promise it
  verifies.

## PERF — performance budgets

k6 budgets as code (thresholds fail the build); baselines recorded in
`docs/PERF-BASELINES.md` so regressions compare against history, not
memory — re-validated post-PX with motion enabled (polish never buys a
budget exception).

- **FastLane**: load 50VU/5m p95<1000ms @10k cases · SOAK 60min @25VU
  (p95 drift <10%, no memory growth) · SPIKE 0→100VU in 30s (err<1%,
  recovery <30s).
- **RefundLens**: dashboard first paint <2s · widget interaction p95 <100ms
  · heartbeat age p95 <60s end-to-end · SSE soak 8h open (no
  connection/memory leak) · ask p95 <2500ms @12mo seed/20VU + cache-hit
  ratio >60% steady — all aggregations server-side; the fence law has NO
  live-mode exception.
- **Flags eval API**: p95<50ms @10k flags × 1k users, 100 RPS burst.
- Record findings against the [EST] capacity envelopes.

## SECURITY — security battery

Run the security-reviewer skill battery as a formal recorded analysis →
`docs/SECURITY-ANALYSIS.md`:

- full command+output matrix
- static analysis (semgrep) on auth/audit/crypto/fence/platform paths
- gitleaks full-history
- npm audit + Trivy image scan (fail on high)
- license check
- SBOM per app + known-CVE report
- fence attempted-escape corpus (20 banned queries incl. injection
  payloads) → all `fenced_query_rejected`
- every THREAT-MODEL top-5 mitigation mapped to a PASSING test or executed
  check — documented-but-unverified = failing.

## OBS — observability (ADR-0017)

Every FT flow asserts its telemetry — a findable trace with the expected
spans + metric increments queryable in the OTel backend; the otel-seeder's
spike fixtures make monitors fire deterministically in tests.

## Triage law

Findings classified **P0** (blocks release) / **P1** (fix before VP demo) /
**P2** (owner + date). P0/P1 fixed via the CHANGE playbook; P2+ filed in
OPEN-QUESTIONS with owner + date. Evidence appended to PILOT-TELEMETRY with
promise-verdicts updated from test results.
