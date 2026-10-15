# ADR-0003 — Platform packages as build-time workspace libraries

Status: accepted · Immutable once merged; amend by new ADR.

## Context

Nine cross-cutting concerns recur in every internal app. They must be
written once, reviewed once, and consumed by all apps — without becoming a
shared runtime service or a shared database (Repo & deployment law §3, §5).

## Options

- **(A) Per-app copies** — zero shared code; every fix is a portfolio
  rewrite; drift guaranteed.
- **(B) Shared runtime service** — one deploy for auth/audit/crypto; adds a
  network hop, a blast radius, and a runtime dep — rejected by law §3.
- **(C) Build-time workspace packages (`@company/*`)** — vendored into each
  app's image at build time; one review covers all apps; no runtime
  coupling.
- **(D) Public registry from day one** — premature; API surfaces are not
  yet stable.

## Decision

**C.** `platform/packages/*` are workspace packages consumed as
`workspace:*` build-time dependencies. Publishing to the private registry
is a separate, later act gated on: own tests + CHANGELOG + stable-API ADR
(see `platform/README.md`). Versioning via changesets.

### API surfaces (frozen by this ADR; changes need an ADR amendment)

| Package | API surface |
| --- | --- |
| `@company/auth` | `verifyIdToken(issuer, jwks)` · `sessionPlugin` (8h TTL) · `requireRole(...roles)` · `rolesMatrix` |
| `@company/audit` | `auditWriter(tx, event)` — same transaction as the state change · `audited(tx, work, event)` · `toSiemLine(row)` |
| `@company/crypto` | `fieldCipher(kms, keyId)` — AES-256-GCM envelope · `KmsProvider` iface · `AwsKmsProvider` · `InMemoryKMS` · `cipher.rotateTo(keyId)` |
| `@company/db` | `migrationRunner(db)` raw-SQL up/down · `appDb(dsn, {expectedDb})` · `paginate(opts)` cursor pagination |
| `@company/http` | `httpPlugin` — `{error:{code,message,detail?,req_id}}` envelope + code registry · `X-Request-ID` threading · `rateLimitPresets` (auth 5/min/IP, mutation 60/min/user, read 300/min/user) · `healthz`/`readyz` |
| `@company/observability` | `metricsRegistry(namespace)` · JSON log schema + `log()` · `alertManifest(service, alerts)` |
| `@company/testing` | `pgHarness(app)` · `defineSeeds`/`runSeeds` (deterministic named seeds) · `k6ScenarioBuilder` · `keyboardMode(page)` helpers |
| `@company/ui` | `tailwindPreset` · `QueueTable` · `useKeyboardNav(bindings)` (j/k/c/a/r configurable) · `initI18n` · axe-clean primitives |
| `@company/deploy` | `Dockerfile.base` · `bluegreen.yaml` · `migration-job.yaml` · `envVarRegistry` |

## Tradeoffs

- Build-time duplication: every app vendors its own copy — larger images,
  but each app deploys/rolls back independently (law §1).
- API surfaces are frozen early; the publish gate exists precisely because
  churn after external consumption is expensive.

## Consequences

- `import-lint` (scripts/ci/import-lint.ts) enforces: platform → nothing
  app-specific; apps ↛ apps; violations fail CI.
- A platform change is a wave deploy: FastLane canary 30–60 min, then all
  apps, each on its own smoke suite (law §2, deploy.yml).
- Graduating a package to the private registry = its own tests + CHANGELOG
  + stable-API ADR. Nothing else needs to change for apps.
