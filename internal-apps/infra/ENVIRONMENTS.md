# Environments — dev / staging / prod

Env var **names only** — values live in the vault; `.env.example` files list
names, never values. Secrets in repo/env files are forbidden globally
(AGENTS.md).

## fastlane — Tier-1 · C4 · 99.9% SLO · own RDS instance

| Var | dev | staging | prod |
| --- | --- | --- | --- |
| `DATABASE_URL` | vault:dev/fastlane | vault:staging/fastlane | vault:prod/fastlane |
| `KMS_KEY_ARN` | vault:dev/fastlane | vault:staging/fastlane | vault:prod/fastlane |
| `DOC_BUCKET` | vault:dev/fastlane | vault:staging/fastlane | vault:prod/fastlane |
| `S3_SIGNER_KMS` | vault:dev/fastlane | vault:staging/fastlane | vault:prod/fastlane |
| `SLACK_DIGEST_URL` | vault:dev/fastlane | vault:staging/fastlane | vault:prod/fastlane |
| `SSO_ISSUER` | vault:dev/sso | vault:staging/sso | vault:prod/sso |
| `SESSION_TTL` | vault:dev/fastlane | vault:staging/fastlane | vault:prod/fastlane |

## refundlens — Tier-2 · C3 · 99.5% SLO · own DB

| Var | dev | staging | prod |
| --- | --- | --- | --- |
| `DATABASE_URL` | vault:dev/refundlens | vault:staging/refundlens | vault:prod/refundlens |
| `REPLICA_DSN` | vault:dev/refundlens | vault:staging/refundlens | vault:prod/refundlens |
| `SSO_ISSUER` | vault:dev/sso | vault:staging/sso | vault:prod/sso |
| `SLACK_ETL_ALERTS` | vault:dev/refundlens | vault:staging/refundlens | vault:prod/refundlens |

## SLO / DR tiers

| Tier | SLO | DR | Apps |
| --- | --- | --- | --- |
| Tier-1 | 99.9% | PITR; restore drill monthly; 5-yr audit retention | fastlane |
| Tier-2 | 99.5% | PITR; restore drill quarterly | refundlens |

## Alerts

Alert manifests live in `infra/alerts/` (via platform/observability) — stub.
