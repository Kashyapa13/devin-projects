# ADR-0016 — Live tier: heartbeat ingestion, SSE, monitors-as-code

Date: 2026-10-15 · Status: decided · Owner: refundlens owner (D7 Devin lane)

## Context

ADR-0015 made RefundLens the Power BI replacement; a BI replacement that
isn't LIVE is a screenshot. Full CDC/streaming (Debezium/Kafka) is too
heavy for a 60-eng pilot.

## Options

- **Chosen:** two-tier ingestion — HEARTBEAT (30–60s incremental delta off
  the existing replica; idempotent upsert; live-window aggregate
  recompute; SSE push) + HOURLY RECONCILIATION (full+delta, transactional
  rebuilds — a beat skipped is a degraded beat, never a silent one).
  Widgets re-bind on heartbeat events, never full reloads; every surface
  shows the watermark; the heartbeat watches itself (a monitor on
  heartbeat age: green <2min · amber 2–5min · red beyond).
  MONITORS-AS-CODE: versioned definitions with tests, evaluated each
  beat, firing to Slack + the monitor panel. All live queries run the
  SAME fenced server-side layer — live mode buys ZERO fence exceptions.
- **Rejected:** CDC/streaming (Debezium + Kafka) — correct tech, wrong
  scale: cluster ops, schema-registry stewardship, and a consumer fleet
  for a 60-eng pilot; revisit via ADR if 30–60s freshness ever proves
  insufficient.
- **Rejected:** hourly-only ETL (status quo) — a BI replacement with
  hour-old data fails the live claim outright.
- **Rejected:** client-side polling refresh — re-mounts widgets, loses
  the watermark contract, and can't degrade loudly.

## Tradeoffs

- Heartbeat adds a second ingestion path to keep honest (idempotent
  delta upsert + live-window recompute + reconciliation pass).
- SSE adds a long-lived connection surface to ops (soak-tested, 8h).
- Monitors-as-code must be versioned, tested, and audited like code —
  because they are.

## Consequences

- The dashboard breathes: heartbeat dot (green <2min · amber 2–5 · red
  beyond), live tail at minute grain, widgets re-bind on SSE events.
- A skipped beat is a degraded beat — the dot + monitor fire, never
  silent staleness.
- Zero fence exceptions — live queries run the same fenced server-side
  aggregation layer.
