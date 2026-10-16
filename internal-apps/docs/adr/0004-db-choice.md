# ADR-0004 — FastLane database: RDS Postgres Multi-AZ + PITR

Status: accepted · Immutable once merged; amend by new ADR.

## Context

Tier-1 KYC review queue: 99.9% SLO, RPO 15min, queue p95 <1s (the PR
promise), raw-SQL migrations, appDb per-app binding. Decisions so far
assume Postgres 16 (root stack law).

## Options

- **(A) RDS Postgres Multi-AZ + PITR (provisioned)** — HA + point-in-time
  recovery matching RPO; predictable latency under the 30 RPS envelope.
- **(B) Aurora Serverless** — cheaper at idle, auto-scales — but cold
  starts on scale-to-zero violate the <1s queue promise; the cost saving
  buys the one regression we pre-committed never to ship.
- **(C) SQLite / embedded** — zero ops, perfect for tests — but no HA, no
  PITR, no concurrent-writer story: unusable for Tier-1.

## Decision

A — provisioned RDS Postgres 16 Multi-AZ with PITR enabled.

## Tradeoffs

Provisioned capacity is paid at idle; cost accepted — the alternative
(B) re-charges that saving as p95 spikes on the path the KPI measures.

## Consequences

- `infra/ENVIRONMENTS.md` holds the DATABASE_URL scope names per env.
- Restore drills monthly via KEEPER (PITR verified, not assumed).
- Capacity revisit at 5x the [EST] envelope (60 analysts / 30 RPS / 50k
  active cases).
