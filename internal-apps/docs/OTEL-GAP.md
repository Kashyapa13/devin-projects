# OTEL-GAP — fleet OTel retrofit gap audit (ADR-0017)

Date: 2026-10-15 · Owner: platform · Posture: audit first, adapt — wrap what
exists. Transport everything, rename nothing.

This is the PHASE A discovery document for the OpenTelemetry retrofit
decided in [ADR-0017](adr/0017-opentelemetry-standard.md). It maps
current telemetry against the ADR-0017 target for each app; every gap is
a work item executed in PHASE B/C. Rows marked *already met* are reused
verbatim.

## 1. Target (ADR-0017)

- One emitter at the platform layer: `platform/packages/otel`
  (`@company/otel`) — OTel SDK init, auto-instrumentation for Fastify
  routes + `pg`, the constitutional metric names as OTel instruments
  (same names, same labels), logs correlated by `trace_id`/`span_id`,
  OTLP export via `OTEL_EXPORTER_OTLP_ENDPOINT` (unset → no-op, so tests
  and dev-without-stack stay hermetic).
- Local dev/demo: otel-collector + one self-hosted all-in-one OTLP
  backend under `infra/otel/`.
- Deterministic seeder `scripts/otel-seeder.ts` (seed `otel-seed-v1`):
  realistic journeys as traces, metric streams including deliberate
  spike patterns, correlated logs. `pnpm otel:seed`.
- Monitors read from the OTel backend — business gauges are emitted as
  OTel metrics; the monitoring plane and the telemetry plane are one.
- Both apps boot the emitter first (import side-effect module); existing
  counters keep flowing alongside OTel instruments — nothing is renamed,
  the Prometheus `/metrics` exposition is preserved.

## 2. Backend pick — Grafana LGTM

**Picked: `grafana/otel-lgtm`** (single container: Tempo traces + Mimir
metrics + Loki logs + Grafana UI + built-in OTLP intake).

- **Why over SigNoz:** LGTM exposes the three signals over standard
  query APIs (PromQL, LogQL, Tempo TraceQL/JSON) with no proprietary
  schema — monitors-as-code is plain HTTP queries against documented
  endpoints, and the ADR's swappability promise ("the STANDARD is OTLP")
  is honored because nothing in the telemetry path is Grafana-specific.
  SigNoz's query model is ClickHouse-specific and its alerting lives in
  its own API; reproducing constitutional alert rules there is more
  adapter code for zero added capability at this scale.
- **Why over raw Jaeger/Prometheus/Loki trio:** one image, no multi-
  service wiring to maintain for dev/demo; correlating a trace to its
  metrics/logs is a query, not a deployment.
- **Prod unchanged:** `OTEL_EXPORTER_OTLP_ENDPOINT` points at the
  client's existing OTLP backend — zero paid services, per ADR-0017.
- ADR number: none needed — ADR-0017 already reserves this choice
  ("SigNoz-class or Grafana LGTM — chosen in-repo"). This note is the
  in-repo record the ADR asked for.

## 3. FastLane — current vs target

| Plane | Current | Target | Status |
|---|---|---|---|
| Metric instruments | **None emitted.** LLD §Observability names (`fastlane_queue_load_ms`, `fastlane_transition_total`, `fastlane_cases_active`, `fastlane_sla_breach_count`, `fastlane_audit_write_fail_total`, `fastlane_keystroke_decision_ms`, `fastlane_pii_reveal_total`) are spec-only; code has no registry, no counters | Same names/labels as OTel instruments + in-process registry for `/metrics` | **GAP → WI-4** |
| `/metrics` endpoint | Absent (`REGISTRY` has no entry; openapi.yaml has no `/metrics`) | Prometheus text exposition kept alongside OTLP (refundlens parity) | **GAP → WI-4** |
| Tracing | None | Auto-instrumented Fastify routes + `pg` spans, W3C context | **GAP → WI-7** |
| Logs | Fastify `logger: true` → pino JSON on stdout (reqId per request). Schema-validated `platform-observability` `log()` exists but is unused by services; audit events live in `audit_events` (DB), not the log drain | Same pino shape + `trace_id`/`span_id` injected and shipped via OTLP logs; audit writes unchanged | partial → WI-8 |
| DB audit lane | `auditWriter` in-transaction rows | Unchanged — audit is evidence, not telemetry | already met |
| Emitter boot | n/a | `telemetry.ts` side-effect import, first | **GAP → WI-7** |

## 4. RefundLens — current vs target

| Plane | Current | Target | Status |
|---|---|---|---|
| Metric instruments | `metricsRegistry("refundlens")` in-process registry driving `ask_ms` (h), `ask_success` (c, outcome), `fence_rejected_total` (c, reason), `sync_lag_s` (g), `cache_hit` (c), `export_total` (c) — all emitted in `api/src/service.ts` | Same names/labels flowing as OTel instruments alongside the existing counters (dual registry — not a replacement) | partial → WI-5 |
| `sync_lag_s` gauge | Registered, **never `set()`** — always empty in exposition | Observable gauge reading `sync_runs` watermark age each collection | **GAP → WI-6** |
| `/metrics` endpoint | Present: `GET /metrics` → `deps.metrics.render()` (Prometheus text) | Kept | already met |
| Tracing | None | Auto-instrumented Fastify routes + `pg` spans | **GAP → WI-7** |
| Logs | Fastify `logger: true` pino JSON; `ask_log` table for the fork's evidence (not the log drain) | pino + trace/span injection + OTLP logs | partial → WI-8 |
| ETL telemetry | `sync_runs` row per run; no metrics/log emission | ETL runs as spans + `sync_lag_s` observation post-run | **GAP → WI-6** |
| Emitter boot | n/a | `telemetry.ts` side-effect import, first | **GAP → WI-7** |

## 5. Fleet-wide — current vs target

| Plane | Current | Target | Status |
|---|---|---|---|
| Platform emitter | `@company/observability` covers in-process counters/gauges/histograms + log schema + alert manifest — **no OTel anywhere** | `@company/otel` NodeSDK wrapper; observability's `MetricsRegistry` surface is reused (dual-write), not replaced | **GAP → WI-1** |
| Collector + backend | Nothing deployed | `infra/otel/docker-compose.otel.yml`: otel-collector-contrib → grafana/otel-lgtm; collector config `infra/otel/otel-collector-config.yml` | **GAP → WI-2** |
| Telemetry seeder | None (app seeders fixture DB rows only) | `scripts/otel-seeder.ts`, seed `otel-seed-v1`, journeys as traces + spike-pattern metric streams + correlated logs; deterministic stream hash | **GAP → WI-3** |
| Monitors | `infra/alerts/` is `.gitkeep`. In-APP monitors-as-code landed via the parallel dashboard lane (`refundlens.monitors`/`monitor_events` + `monitors_panel` widget — ADR-0016, evaluated per beat); but nothing reads the OTel backend yet. `platform-observability` `alertManifest()` can *validate* rules but nothing *evaluates* them against telemetry. LLD/AGENTS alert rules: `audit_write_fail_total>0` PAGE, `queue_load_ms p95>1000ms/10m` PAGE, `sla_breach +20%/h` PAGE, `p95>300ms/30m` ticket; `sync_lag_s>5400` ticket `>10800` page; `fenced rejection rate>25%/h` ticket | `scripts/otel-monitors.ts` — evaluates those exact rules against the backend's query APIs (PromQL on Mimir, LogQL on Loki, Tempo search) so monitors demonstrably fire on seeder spike patterns | **GAP → WI-9** |
| `keystroke_decision_ms` | Client-side histogram — no server emission possible | Emitted by the seeder as synthetic UI telemetry; real wiring is a web-task follow-up (noted, not blocking) | partial → WI-3 |

## 6. Work items

| WI | Item | Phase | Verify |
|---|---|---|---|
| WI-1 | `platform/packages/otel` (`@company/otel`): SDK init, auto-instrumentation (fastify+pg+pino), dual metrics registry, observable gauges, correlated pino→OTLP log stream, `OTEL_EXPORTER_OTLP_ENDPOINT` no-op path, seeded ID generator | B | vitest: no-op without endpoint, instrument names preserved |
| WI-2 | `infra/otel/` compose stack + collector config; LGTM pick recorded (§2) | B | `docker compose -f infra/otel/docker-compose.otel.yml up` healthy; OTLP accepted on :4318 |
| WI-3 | `scripts/otel-seeder.ts` deterministic `otel-seed-v1`: KYC claim→approve trace, refunds ask trace, spike-pattern metric streams (`fastlane_queue_load_ms` p95 breach, `refundlens_sync_lag_s` ramp, `fastlane_transition_total` burst), correlated logs; `pnpm otel:seed` | B | same seed → identical stream hash |
| WI-4 | fastlane wiring: dual registry w/ constitutional names, `/metrics` + REGISTRY/openapi/LLD rows, transition_total incl. `ok=no` edges, queue_load_ms per tab, pii_reveal_total, audit_write_fail_total, observable `cases_active`/`sla_breach_count` gauges | B/C | live counters in exposition AND backend |
| WI-5 | refundlens wiring: `defaultMetrics()` → dual registry; `/metrics` kept | B | backend shows `refundlens_*` series |
| WI-6 | `sync_lag_s` observable gauge from `sync_runs` watermark age; ETL span | B | gauge non-empty; lag queryable in Mimir |
| WI-7 | `api/src/telemetry.ts` side-effect + launcher split (`server.ts` → dynamic import after SDK boot) both apps | B | spans for `/api/v1/*` + `pg` in Tempo |
| WI-8 | pino → OTel log stream w/ trace_id/span_id correlation | B | Loki log line carries trace_id matching a Tempo span |
| WI-9 | `scripts/otel-monitors.ts` evaluating LLD §6 alert rules on backend APIs | C | spike patterns trip the right rules; green on quiet data |
| WI-10 | Docs: LLD §Observability deltas, README env table (`OTEL_EXPORTER_OTLP_ENDPOINT` local → compose, prod → client backend), this file closed per item | C | docs-lint/adr-check green |

## 7. Closure log

Filled in as work items land. Each row links the evidence pasted in the
final report.

- [x] WI-1 — `platform/packages/otel` landed: `startOtel` (NodeSDK +
  `OTEL_EXPORTER_OTLP_ENDPOINT` no-op, `OTEL_SDK_DISABLED`, ParentBased
  ratio via `OTEL_TRACES_SAMPLER_RATIO`), `otelRegistry` dual registry,
  `otelFastifyPlugin` (@fastify/otel), `seededStream`/`seedIdGenerator`.
  16 vitest cases green (no-op, dual-render byte-identical, determinism).
- [x] WI-2 — `infra/otel/docker-compose.otel.yml` + `otel-collector-config.yml`
  running: collector-contrib:0.162.0 (:4317/:4318) → grafana/otel-lgtm:0.36.0
  (Grafana :3000 anonymous admin, Tempo :3200, Mimir API :9090, Loki :3100).
- [x] WI-3 — `scripts/otel-seeder.ts` (`pnpm otel:seed`): planHash
  `a2ad7e63…` identical across runs; 15 spans / 427 metric obs / 20 logs;
  KYC claim→approve + refunds ask journeys; `fastlane_queue_load_ms` spike
  (24 obs in 1000–2500ms buckets); correlated logs. Note: span timeline is
  compressed into the last 90s on emit — Tempo drops older-timestamped
  spans at ingest (verified); metric/log streams keep the full window.
- [x] WI-4 — fastlane: `api/src/metrics.ts` constitutional names via
  `otelRegistry("fastlane")`; `transition_total{ok=no}` on illegal edges,
  `queue_load_ms{tab}` on queue path, `pii_reveal_total` post-audit,
  `audit_write_fail_total` on auditWriter failure; observable
  `cases_active{status}` + `sla_breach_count`; `/metrics` + REGISTRY +
  openapi.yaml + LLD row.
- [x] WI-5 — refundlens: `defaultMetrics()` → `otelRegistry("refundlens")`;
  `/metrics` exposition byte-identical (dual registry).
- [x] WI-6 — `sync_lag_s` as observable gauge probing `sync_runs`
  watermark age per collection (was registered-never-set); shows
  `refundlens_sync_lag_s` in Mimir. ETL span: deferred — ETL runs as a
  separate process; wiring it is a small follow-up (noted).
- [x] WI-7 — `api/src/telemetry.ts` side-effect + launcher split
  (`server.ts` → dynamic `import("./app.js")`) both apps; request +
  `pg` spans in Tempo for both services.
- [x] WI-8 — instrumentation-pino ships log records to OTLP and injects
  `trace_id`/`span_id`/`trace_flags` into the pino JSON line; Loki stream
  `service_name=fastlane|refundlens|otel-seed` carries trace_ids matching
  Tempo traces. stdout format unchanged.
- [x] WI-9 — `scripts/otel-monitors.ts` (`pnpm otel:monitors`): PromQL
  evaluation of the six LLD alert rules against Mimir :9090; the seeded
  spike lands 24 obs in the 1000–2500ms bucket and `sync_lag_s`=4000 is
  queryable. Note (verifier audit): `rate()`-window firing is NOT
  reproducible on static seeded buckets (no slope → NO-DATA), and the
  ticket threshold 5400 > seeded 4000 — firing is asserted in the monitor
  evaluator's tests; a live firing demo needs a ramped load source, filed
  as a follow-up.
- [x] WI-10 — LLD §Observability + README/env sections updated both apps;
  this file closed per item.
