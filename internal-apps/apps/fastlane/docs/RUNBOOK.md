# fastlane — RUNBOOK

Skeleton — sessions that touch these flows fill the steps (docs
contract §6). Env matrix + thresholds live in AGENTS.md §8.

## Deploy
TODO: pipeline order (scan → test → approval → protected env), the
migration-job step, smoke checks that must pass before traffic swap.

## Rollback
Blue/green switch-back + auto-rollback triggers (error rate >2%/5m,
queue p95 >1200ms/10m). TODO: manual force-rollback command + who approves.

## Rotate secrets
TODO: vault scopes (DATABASE_URL, KMS_KEY_ARN, DOC_BUCKET,
S3_SIGNER_KMS, SLACK_DIGEST_URL, SSO_ISSUER), restart requirements,
KMS key rotation cadence (90-day) and its effect on ciphertext reads.

## Restore from backup / PITR
TODO: drill procedure (monthly via KEEPER), RPO 15min / RTO 1h
verification, last-verified date.

## Common incidents
TODO: top plays — audit_write_fail page → check /readyz deps →
severity ladder; sla-breach spike → digest + staffing play; signed-URL
errors → signer key + bucket policy checks.
