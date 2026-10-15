# RefundLens — LLD

## Feature Catalog (F-NN — the §4.2 feature spec)

Every feature: screen, role, interaction, the acceptance assertion a test
can run, and the press-release promise it serves. A PR that adds behavior
adds a row here in the same diff.

| F-NN | Screen | Role | Interaction | Acceptance assertion | PR-promise trace |
|---|---|---|---|---|---|
| F-01 | Aggregate console `/view` | analyst | pick dim/metric/window/filters → server-rendered view; full state lives in query params → shareable URL | share link reproduces the EXACT view and numbers; watermark visible on the surface | "the same number twice" · median TTA <60s |
| F-02 | Ask box | analyst | type a question → deterministic NL→SQL → answer + expandable SQL + row preview | envelope = `{answer, sql, rows, watermark, took_ms}`; every banned construct → `fenced_query_rejected` with guidance, never best-effort | median TTA <60s · shows-its-work · **motion notes (ADR-0014):** answer card Reveal settle · leading count counts up on `gentleSettle` · rows stagger draw-in (re-bind, never re-mount) · fenced rejection shake + inline guidance |
| F-03 | Answer history `/ask/:id`, `/ask/me/history` | analyst | reopen a past answer by id; replay its SQL | every ask lands in `ask_log` (question, rendered_sql, ms, rows, success); `/ask/:id` returns the logged answer | evidence for the fork · reproducibility |
| F-04 | Export CSV | analyst | export current view → download | CSV header comment carries the watermark; footer row count == rows in file; exact counts only; bypasses the 60s cache | "same number twice" · exact-count law |
| F-05 | Staleness banner (all pages) | analyst | passive | sync lag >90m → amber banner on every surface + `#refundlens_sync_lag` alert; banner clears when lag recovers | never silently stale |
| F-06 | Sync health surface `/health/sync` | service (ops) | poll watermark + lag | returns `{watermark, lag_s, last_run_status}`; lag >5400s → ticket, >10800s → page | ops truth for the freshness claim |
| F-07 | Hourly ETL sync | etl (job) | scheduled: replica → raw UPSERT → one-tx agg rebuild → sync_runs row | re-running the same window produces zero delta (idempotent); a `sync_runs` row exists for every run incl. failures | hourly freshness behind every answer |
| F-08 | Fork report | service (job) | weekly `scripts/fork_report.ts` reads `ask_log` | emits ask-vs-filter session split; runs weekly until the dated fork decision lands (OPEN-1 #askbox-keep-retire) | the falsifier itself |
| F-09 | Dashboard global bar `/dashboard` | analyst · ops viewer | date-range presets (24h/7d/30d/90d/12M/custom) · compare-to-previous toggle · global filters (channel, segment, reason, state) · saved views as shareable query-param state | changing range/filter re-binds every widget server-side; a saved-view URL reproduces the exact dashboard | THE Power BI replacement surface (ADR-0015) |
| F-10 | Live heartbeat | all dashboard roles | pulsing dot — green <2min · amber 2–5 · red beyond; tooltip = watermark + last-event age; auto refresh on SSE events; last-24h live tail (minute grain) | beat → SSE → widgets re-bind WITHOUT reload; stalled beat flips the dot amber/red | ADR-0016 · never silently stale |
| F-11 | Monitors panel + `/monitors` (admin) | analyst (view) · admin (manage) | monitor-status widget (state, last fired, owner, severity); versioned monitors-as-code evaluated per beat; firing → Slack + `monitor_events` | a seeded spike fires a monitor → Slack stub + events row; heartbeat-age monitor ships by default | ADR-0016 · monitoring is code |
| F-12 | KPI stat row (8 cards) | analyst · ops viewer | refunds today · refund rate · total refunded · pending-approval count+amount · avg+p95 latency · top reason · at-risk count — each with sparkline + delta + click-through | every card = a server-computed series via the fenced layer; delta = period-over-period | BI bar (§4.2) |
| F-13 | Time series widgets | analyst · ops viewer | volume + amount over time (multi-series by channel/segment, stacked option) · refund-rate trend with threshold band · z-score anomaly markers labeled "heuristic" | series rendered server-side; anomaly markers carry the heuristic label | BI bar (§4.2) |
| F-14 | Heatmap: refunds hour × day-of-week | analyst · ops viewer | signature widget on agg_hourly grain | heatmap renders 7×24 cells server-computed; empty cells render as empty, not error | BI bar (§4.2) |
| F-15 | Breakdowns + scatter | analyst · ops viewer | donut by reason code · top-N bars by merchant/segment (count/amount/rate, sortable) · latency-vs-amount scatter (density shading) | sort changes re-query server-side; no client-side aggregation | BI bar (§4.2) |
| F-16 | Cross-filter + detail table + export | analyst | click any chart point/segment → filters the detail table (and vice versa — drill is one click everywhere) · CSV export (exact counts, watermark header, bypasses cache) | one click on a series constrains every dependent widget; export footer count == rows | BI bar (§4.2) · exact-count law |
| F-17 | Sync admin surface `/sync` | admin | watermark, lag, last-run rows, alert status | returns sync_runs history + heartbeat age; admin role only | ops truth for the freshness claim |

Roles: `analyst` (SSO — ask / dashboard / export) · `ops viewer`
(dashboard only) · `admin` (sync health + monitors management) · `etl`
(sync job's DB role — INSERT/UPDATE only, no app login) · `service`
(health/report callers). No debug/SQL console — FORBIDDEN by AGENTS §9.

## Core DDL (commentary — schema truth lives in db/migrations)

```sql
CREATE TABLE refund_events_raw (   -- hourly full+delta, idempotent on (id, updated_at)
  id bigint PRIMARY KEY, txn_ref text, occurred_at timestamptz, channel text,
  merchant_segment text, amount_cents bigint, reason_code text,
  state text, latency_ms int, updated_at timestamptz NOT NULL,
  ingested_at timestamptz DEFAULT now()
);
CREATE INDEX raw_by_updated ON refund_events_raw (updated_at);   -- sync watermark cursor
CREATE INDEX raw_by_day_channel ON refund_events_raw
  (occurred_at, channel, merchant_segment, reason_code);
CREATE TABLE agg_daily (           -- rebuilt in ONE tx after each sync; views hit this
  day date, channel text, merchant_segment text, reason_code text,
  cnt bigint, amount bigint, p50_ms int, p95_ms int,
  PRIMARY KEY (day, channel, merchant_segment, reason_code)
);
CREATE TABLE sync_runs (id bigserial, watermark timestamptz,
  watermark_id bigint,                  -- (updated_at, id) cursor tiebreak
  rows int, status text, finished_at timestamptz);   -- one row per run, success or failure
CREATE TABLE ask_log (            -- the fork's evidence + shows-its-work history
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
  surface text NOT NULL DEFAULT 'ask', question text NOT NULL,
  rendered_sql text, ms int, rows int, success bool NOT NULL,
  fence_reason text, req_id text, created_at timestamptz DEFAULT now()
);
CREATE TABLE agg_hourly (          -- heatmap grain: hour × day-of-week (ADR-0015)
  day date, hour smallint, channel text, reason_code text,
  cnt bigint, amount bigint,
  PRIMARY KEY (day, hour, channel, reason_code)
);
CREATE TABLE monitors (         -- monitors-as-code definitions, versioned (ADR-0016)
  id uuid PRIMARY KEY, name text, metric text, window text,
  condition text, threshold jsonb, severity text, owner text,
  channel text, enabled bool DEFAULT true, version int NOT NULL DEFAULT 1
);
CREATE TABLE monitor_events (   -- firing history — the monitoring audit trail
  id bigserial PRIMARY KEY, monitor_id uuid REFERENCES monitors(id),
  fired_at timestamptz DEFAULT now(), value jsonb, state text
);
CREATE INDEX monitor_events_by_monitor  -- latest-event lookups (monitors_panel)
  ON monitor_events (monitor_id, fired_at DESC);
-- roles: app = SELECT only on refund_events_raw, agg_daily, agg_hourly, sync_runs.
-- etl = separate role, INSERT/UPDATE only, no login path.
-- monitors/monitor_events: app = SELECT; evaluator role writes events.
```

## API registry

POST `/ask` {question} → `{answer, sql, rows, watermark, took_ms}`
(60s normalized-hash cache) · GET `/view?dim&metric&from&to&filters`
(typed params → shareable state) · GET `/ask/:id` · GET `/ask/me/history`
· GET `/export.csv` (exact counts, watermark in header comment, bypasses
cache) · GET `/health/sync` (watermark + lag + last run status) ·
GET `/api/stream/heartbeat` (SSE — heartbeat events; ADR-0016; bearer or
`?token=` JWT — ADR-0018) · POST `/api/internal/beat` (service — the
heartbeat posts each beat here; records + fans out, degraded never
silent) · GET `/api/monitors` + PATCH `/api/monitors/:id` (admin —
monitors-as-code defs; patch bumps `version`) ·
GET `/api/widgets/:name` (typed params → server-computed series via the
SAME fenced template layer — the WIDGET LAW; §4.2) ·
GET `/api/v1/health/sync` (analyst+ops+service — watermark + lag +
heartbeat age) · GET `/api/v1/sync` (admin — sync_runs history +
heartbeat age) · platform `/healthz` `/readyz` `/metrics`.

Error envelope per platform-http: `{error:{code,message,detail?,req_id}}`.
Fence rejections carry `code:"fenced_query_rejected"` + actionable
guidance. New endpoint = a row here + contract test first (AGENTS §5
equivalent — the registry is the drift gate's source).

| Endpoint | analyst | ops | admin | service | etl |
|---|---|---|---|---|---|
| POST /ask | ✓ | — | — | — | — |
| GET /view | ✓ | — | — | — | — |
| GET /ask/:id · /ask/me/history | own history | — | — | — | — |
| GET /export.csv | ✓ | — | — | — | — |
| GET /api/widgets/:name | ✓ | ✓ | — | — | — |
| GET /api/stream/heartbeat | ✓ | ✓ | — | — | — |
| POST /api/internal/beat | — | — | — | ✓ | — |
| GET /api/monitors · PATCH /api/monitors/:id | — | — | ✓ | — | — |
| GET /api/v1/health/sync | ✓ | ✓ | — | ✓ | ✓ |
| GET /api/v1/sync | — | — | ✓ | — | — |
| ETL sync (DB only, no HTTP) | — | — | — | — | ✓ |
| heartbeat (job — runSync + evaluate + beat POST) | — | — | — | ✓ | — |
| fork_report (DB only, no HTTP) | — | — | — | ✓ | — |

## The fence — spec (all six mandatory + AST)

Enforcement order inside `api/ask/`: generate → parse AST → check fences
→ EXPLAIN → execute on the read-only role. Any failure =
`fenced_query_rejected` — the generator never retries into a best effort.

| # | Fence | Mechanism | Rejection |
|---|---|---|---|
| 1 | Read-only DB role | connection binds a SELECT-only role on the `refundlens` schema; writes fail at the DB layer | attempt → 500 + `fence` log (should be unreachable — treated as incident) |
| 2 | Single-schema allowlist | identifiers resolve only inside `refundlens`; any other schema ref fails AST resolution | `fenced_query_rejected` — name the allowed tables |
| 3 | Mandatory LIMIT | statement must carry LIMIT ≤ 5000; default 500 injected by templates | missing or over-cap LIMIT → `fenced_query_rejected` |
| 4 | statement_timeout 5s | set on the read-only role's session, not per-query client config | timeout → error envelope, counts as `error` not `fenced` |
| 5 | EXPLAIN cost cap | EXPLAIN before execute; total cost >5000 rejected | `fenced_query_rejected` + guidance to narrow dim/window/filters |
| 6 | Banned tables | `ask_log` (every scope); `sync_runs` on the ASK scope only | `fenced_query_rejected` — see ADR-0018 for per-path scopes |

AST validation, not regex: generated SQL is parsed; DDL/DML tokens
(INSERT/UPDATE/DELETE/DDL/multiple statements) post-generation fail at
the AST stage regardless of how they are spelled. Regex would miss
spelling; the AST cannot.

## Template renderer contract (views — typed params only)

Client sends `{dim, metric, from, to, filters[]}` — never SQL, never an
identifier. Server-side, the SAME template library the ask path emits
through renders the statement: dims/metrics from an allowlist registry,
filters as typed ops on allowlisted columns, all values bound as
parameters (no identifier interpolation, ever). Rendered view SQL passes
through the identical fence checks — a view is not a back door around
the six fences. Param fuzzing is a unit gate (§test matrix).

## Observability (§6 — exact names)

Metrics: `refundlens_ask_ms` (h) · `refundlens_ask_success` (c,
ok/fenced/error) · `refundlens_fence_rejected_total` (c, reason) ·
`refundlens_sync_lag_s` (g) · `refundlens_cache_hit` (c) ·
`refundlens_export_total` (c).
Alerts: sync_lag_s >5400 = ticket · >10800 = page · ask fenced-rejection
rate >25% over 1h = ticket (product signal — users ask what the fence
can't serve). Log fields: ts, level, req_id, user_id,
surface(ask|view|export), ms, rows, cached. Banned: raw query results.

Transport (ADR-0017): platform `otelRegistry("refundlens")` dual-writes
every instrument — same names/labels — to OTel OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`;
local → `infra/otel` collector → Grafana LGTM :4318, prod → client OTLP
backend) AND the in-process `/metrics` exposition. `sync_lag_s` is a
DB-probed observable gauge (was: registered-and-never-set). Logs: pino →
OTLP with injected trace_id/span_id; stdout unchanged. Sampler:
`OTEL_TRACES_SAMPLER_RATIO` controls ParentBased-ratio; AlwaysOn default.

## Test matrix (§7 gates)

| Gate | Scope | Assertions |
|---|---|---|
| lint+typecheck | repo | tsc clean |
| unit: fence module | api/ask | table-driven: mutation, DDL, cross-schema, no-LIMIT, over-cap cost, timeout — every banned construct rejected; AST catches spelling variants regex would miss |
| unit: template renderer | api/ask + views | param fuzzing: injection-shaped values stay bound parameters; unknown dims/metrics/filters rejected |
| integration (ephemeral PG) | ETL + store | fixed seed `refund-seed-v1`: agg_daily exact numbers — assert **5,432**, not ≈5000; ETL re-run over the same window = zero delta; watermark propagates store → envelope → CSV header |
| contract | api | OpenAPI vs this registry — drift fails |
| e2e (recorded) | web | ask → inspect SQL → share link reproduces exact view → export row count matches footer |
| perf (k6) | api+db | 12-month dataset, 20 VU: view p95 <800ms, ask p95 <2500ms |

## Capacity envelope (§8)

[EST] 12-month retention · ~5M raw rows · 50 analysts · 10 RPS —
revisit at 5x.

## Deployment

Single-AZ app + Multi-AZ DB; ETL as a scheduled job with failure alert;
blue/green; auto-rollback on error rate >2% (10m). Vault: REPLICA_DSN,
DATABASE_URL, SSO_ISSUER, SLACK_ETL_ALERTS. Tier-2: 99.5% SLO, RTO 4h,
business-hours support. Env per environment (ADR-0017):
`OTEL_EXPORTER_OTLP_ENDPOINT` — local → `http://localhost:4318`
(`infra/otel` compose → collector → Grafana LGTM), prod → client's
existing OTLP backend; unset → emitter no-ops.

## Usage KPIs (= the PR promises)

median time-to-answer <60s · ask-vs-filter session split (the fork
trigger, F-08) · export count · stale-banner incidence · fenced-
rejection rate.
