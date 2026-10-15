# refundlens — RUNBOOK

Skeleton — sessions that touch these flows fill the steps (docs
contract §6). Env matrix + thresholds live in AGENTS.md §8.

## Deploy
TODO: pipeline order (scan → test → approval → protected env), the
migration-job step, smoke checks that must pass before traffic swap.

## Rollback
Blue/green switch-back + auto-rollback trigger (error rate >2%/10m).
TODO: manual force-rollback command + who approves (business-hours
support — page path vs ticket path).

## Rotate secrets
TODO: vault scopes (REPLICA_DSN, DATABASE_URL, SSO_ISSUER,
SLACK_ETL_ALERTS), restart requirements, rotation cadence; note that
REPLICA_DSN rotation must never be satisfied by pointing at the primary.

## Restore from backup
TODO: drill procedure (quarterly via KEEPER — Tier-2), RTO 4h
verification, last-verified date; rollup-store rebuild-from-source path
(ETL full re-run as an alternative to restore, and when that is legal).

## Common incidents
TODO: top plays —
- ETL lag: sync_lag_s >5400 ticket → check sync_runs last status →
  replica connectivity / lock contention → amber banner is automatic.
- sync_lag_s >10800 page → same play + page owner (business hours: who).
- Replica drift/failure → ETL fails hard; verify app never fell back to
  primary (read path = rejected PR — confirm by config, not hope).
- Fence-rejection spike >25%/1h ticket → read ask_log for the rejected
  shapes → product signal: extend templates or dims registry, never
  loosen the fence.
- Missing watermark on a surface = P1 → find which surface dropped the
  envelope field; treat as data-integrity bug, not a UI nit.
