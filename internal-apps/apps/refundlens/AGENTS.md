# RefundLens — AGENTS.md (app constitution)

Tier-2 decision-support app. SLO: 99.5% · RTO 4h · business-hours support.
Data class C3: tokenized refs only. NO PANs, no cardholder data, ever —
if a source field looks like cardholder data, STOP and report; do not
map it, do not "anonymize it yourself."

## 1. Stack (fixed — changes require ADR)
Same platform base as FastLane (Node 22/Fastify/TypeBox/Drizzle/React 19 PWA/
Vitest/Testcontainers/Playwright/k6/axe). Additions: no NL/LLM dependency in
the request path — the ask engine is a deterministic NL→SQL module
(templates + fenced generator in api/ask/); anything model-assisted stays
behind the fence module and is evaluated by the fence tests.

## 2. Data path law
- Read-only by design. Any future mutation (e.g., refund approval
  actions) requires an ADR adopting maker-checker dual-control: a second,
  DISTINCT approver above a set threshold ($5,000 default); self-approval
  returns 403 even below threshold for the proposer; server-enforced;
  audited.
- ETL: hourly, reads REPLICA DSN only (vault: REPLICA_DSN; writing to or
  reading the primary = rejected PR). Idempotent UPSERT on (id, updated_at).
- rollup store role: app = READ-ONLY (SELECT on refund_events_raw,
  agg_daily, sync_runs). etl = separate role with INSERT/UPDATE only.
- agg_daily rebuilt in one transaction after each sync; sync_runs row
  records watermark+rows+status every run, success or failure.

## 3. The fence (NL→SQL) — implement exactly, test exhaustively
Fences, all mandatory: read-only DB role · single schema allowlist ·
mandatory LIMIT (default 500, max 5000) · statement_timeout 5s ·
EXPLAIN cost cap (total cost > 5000 → reject with guidance) · banned
tables: ask_log, sync_runs, any schema outside refundlens · no DDL/DML
tokens post-generation (AST validation, not regex). A fenced violation
returns {error:{code:"fenced_query_rejected",...}} — never a best effort.
Client "views" NEVER submit SQL — only typed params {dim,metric,from,to,
filters[]} rendered server-side by the same template library.
Every answer: {answer, sql, rows, watermark, took_ms}. Watermark on every
surface including CSV export header comment. No watermark = bug, P1.

## 4. Staleness & caching
Sync lag > 90 min → amber banner on all pages + #refundlens_sync_lag alert.
Cache: 60s TTL, keyed by normalized-SQL hash; cache hit returns identical
envelope with took_ms = cache_ms. Exports bypass cache (exact counts only).

## 5. The fork (evidence-gated, do not pre-judge)
docs/OPEN-QUESTIONS.md#conversational-vs-pbi owns this. Weekly report
script (scripts/fork_report.ts) computes ask-vs-filter session split from
ask_log. At 4 weeks: ask-box < 20% of sessions → draft retirement ADR,
notify owner in PR. Do not remove ask_log or the report before the date.

## 6. Observability
Metrics: refundlens_ask_ms (h) · refundlens_ask_success (c, ok/fenced/error)
· refundlens_fence_rejected_total (c, reason) · refundlens_sync_lag_s (g) ·
refundlens_cache_hit (c) · refundlens_export_total (c).
Alerts: sync_lag_s > 5400 = ticket; > 10800 = page. ask fenced-rejection
rate > 25% over 1h = ticket (users are asking things the fence can't serve —
product signal, not just noise). Log fields: ts,level,req_id,user_id,
surface(ask|view|export),ms,rows,cached. Banned: raw query results in logs.

## 7. Testing gates
Unit: fence module — table-driven: every banned construct rejected
(mutation, DDL, cross-schema, no-LIMIT, over-cap cost, timeout);
template renderer param fuzzing. Integration: fixed seed "refund-seed-v1":
agg_daily exact-number assertions (assert 5,432 — not "≈5000"); idempotent
ETL re-run zero-delta test; watermark propagation. E2E recorded: ask →
inspect SQL → share link reproduces exact view → export row count matches
footer. Perf: 12-month dataset, 20 VU, view p95 < 800ms, ask p95 < 2500ms.

## 8. Deploy & env vars
Single-AZ app + Multi-AZ DB; scheduled ETL job with failure alert;
blue/green; auto-rollback on error > 2% (10m). Vault: REPLICA_DSN,
DATABASE_URL, SSO_ISSUER, SLACK_ETL_ALERTS. Capacity [EST]: 12mo retention,
~5M raw rows, 50 analysts, 10 RPS. Revisit at 5x.

## 9. Devin session protocol
START: root AGENTS.md → this file (already in your context) → HLD → LLD →
OPEN-QUESTIONS (the fork).
STOP-CONDITIONS: cardholder-looking field, unfenced SQL request, writing to
raw/agg from the app role, watermark suppression request, fork
pre-judgement, anything in platform/.
EVERY PR: code+tests+docs+ADR-if-architectural; drift gates green.
FORBIDDEN: "helpful" admin/debug SQL endpoints; estimate numbers in
exports; removing instrumentation; reading primary; caching exports.
