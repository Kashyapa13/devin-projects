# fastlane — AGENTS.md (§3.2)

Tier-1 · C4 regulated PII (KYC) · 99.9% SLO · own RDS instance.

## Start here

Root constitution (injected) → this file → `docs/HLD.md` → `docs/LLD.md` →
`docs/OPEN-QUESTIONS.md` → `docs/RUNBOOK.md` → `docs/THREAT-MODEL.md` → plan.

## Non-negotiables

- C4: app-layer AES-256-GCM + KMS envelope; never in
  logs/telemetry/prompts/non-prod; synthetic fixtures only
  (`scripts/seed.ts` = "kyc-seed-v1").
- Schema truth lives only in `db/migrations` (raw SQL + `down.sql` pairs);
  LLD's schema section is commentary — drift fails CI.
- audit_events on all mutations; 5-yr retention.
- Acceptance = EXECUTED commands with outputs recorded.

## Layout

`api/{routes,services,statemachine}` · `web/` · `db/migrations` ·
`scripts/` (seed, `perf/k6-queue.js`) · `openapi.yaml` · `Dockerfile` ·
`.env.example` (names only — see `infra/ENVIRONMENTS.md`).

## Stop-conditions (in addition to root)

PII anywhere in non-prod · un-audited mutation · state transition without
ADR · queue p95 regression vs the <1s KPI.
