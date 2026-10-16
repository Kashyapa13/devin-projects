# ADR-0010 — RefundLens data path: own rollup store via hourly ETL off the replica

Status: accepted · Immutable once merged; amend by new ADR.

## Context

Tier-2 refunds answer service: 99.5% SLO, median time-to-answer <60s,
~5M raw rows over 12 months, C3 data only. The source of truth is the
prod refunds DB; analytical reads must never touch it. Root law: each
app owns its own database, migrations live in-app.

## Options

- **(A) Own rollup store, hourly ETL off the read replica** — the app
  binds a SELECT-only role to its own Postgres; ETL (separate
  INSERT/UPDATE-only role) UPSERTs raw events idempotently on
  (id, updated_at) and rebuilds agg_daily in one transaction, logging a
  sync_runs row per run.
- **(B) Query the replica directly** — zero sync code — but source
  schema drift breaks the app silently, Tier-2 uptime becomes coupled to
  prod load on the replica, and there is no watermark to publish; the
  cost is unverifiable freshness and a silent-failure mode.
- **(C) Warehouse + dbt/BI** — the right shape at scale — but a second
  stack stood up for one app at pilot size; the cost is a whole ops
  surface (scheduler, models, BI tenancy) bought before the fork even
  decides if the lane survives.

## Decision

A — own rollup store; ETL reads REPLICA_DSN only, never the primary.

## Tradeoffs

An hour of staleness is accepted by design — the watermark carries that
truth to every surface instead of hiding it. ETL becomes a second thing
to run and alert on (sync_runs, lag alerts); the cost is operational,
the benefit is the app can only ever read, never write, the source.

## Consequences

- Roles: app = SELECT on refund_events_raw, agg_daily, sync_runs;
  etl = INSERT/UPDATE only, no login path. Writing to or reading the
  primary = rejected PR (AGENTS §2).
- sync_runs row every run, success or failure — freshness is verifiable
  or the watermark lies.
- Capacity revisit at 5x the [EST] envelope (5M rows / 50 analysts /
  10 RPS); warehouse graduation is a new ADR, not a refactor.
