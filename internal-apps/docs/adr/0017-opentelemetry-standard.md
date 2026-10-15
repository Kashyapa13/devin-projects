# ADR-0017 — OpenTelemetry is the observability standard

Date: 2026-10-15 · Status: decided · Owner: platform

## Context

Per-app bespoke metrics endpoints and log formats fragment the
observability plane; the client already operates an OTLP-capable
backend.

## Options

- **Chosen:** every app emits OTel (OTLP traces + metrics + logs) via
  `platform-otel` — auto-instrumentation (routes, DB), W3C trace context
  end-to-end, the constitutional metric names as OTel instruments.
  EVERYTHING is read from the OTel backend: monitors (business gauges are
  emitted as OTel metrics by each RefundLens heartbeat), alerting, ops
  views. Dev/demo runs self-hosted: otel-collector + an all-in-one OTLP
  backend (SigNoz-class or Grafana LGTM — chosen in-repo; the STANDARD is
  OTLP, so the backend is swappable). Production points
  `OTEL_EXPORTER_OTLP_ENDPOINT` at the client's existing backend — no
  paid services added. The otel-seeder (deterministic, seed
  `otel-seed-v1`) generates synthetic traces/metrics/logs — including
  deliberate spike patterns so monitors demonstrably fire — powering
  dev, demo, FTs, and rehearsals.
- **Rejected:** bespoke metrics endpoints per app + vendor APM — the
  status quo: every app invents its own /metrics shape, monitors can't
  federate, and a paid APM is both cost and a second observability plane.
- **Rejected:** metrics-only OTel (skip traces/logs) — halves the
  correlation value for the hardest part of the job (request-scoped
  debugging across route → DB).

## Tradeoffs

- One more platform package (`platform-otel`) — but it replaces, not
  adds to, per-app telemetry code.
- OTel SDK overhead on the hot path — measured and bounded (<5% p95
  delta, sampling if over).
- Compose stack gains otel-collector + backend — dev/demo only; prod
  points at the client's existing OTLP backend.

## Consequences

- One telemetry contract for every app; new apps plug in by importing
  `platform-otel` (no app hand-rolls telemetry).
- Monitors read from the OTel backend — business gauges emitted as OTel
  metrics; the monitoring plane and the telemetry plane are one.
- `OTEL_EXPORTER_OTLP_ENDPOINT` is the single env var: local → compose
  backend; prod → client's existing backend. Zero paid services.
