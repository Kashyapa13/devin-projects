# fastlane — RUNBOOK

Skeleton — sessions that touch these flows fill the steps (docs
contract §6). Env matrix + thresholds live in AGENTS.md §8.

## Functional tests (e2e, keyboard-mode)

The `ft.yml` gate runs `apps/fastlane/e2e` per PR. Locally:

```bash
docker compose up -d fastlane-pg                       # per-app Postgres
pnpm --filter @app/fastlane... build                    # api + web
export DATABASE_URL=postgres://fastlane:fastlane-dev@localhost:5432/fastlane
export SESSION_SECRET=<fixture>  SSO_ISSUER=fastlane    # dev shim only
pnpm --filter @app/fastlane migrate
pnpm --filter @app/fastlane seed                        # kyc-seed-v1
pnpm --filter @app/fastlane exec playwright install --with-deps chromium
pnpm --filter @app/fastlane test:ft                     # playwright boots api+web
```

Auth: `e2e/global-setup.ts` mints a reviewer JWT via `scripts/mint-token.ts`
(the localStorage dev-SSO shim — prod auth is the IdP flow). PII law: the
suite asserts the masked panel and never exercises `/reveal` — a legal_name
must not appear in traces/recordings. On failure, CI uploads
`test-results/` + `playwright-report/` (traces + videos, 14-day).

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
