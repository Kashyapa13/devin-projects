# platform/

Build-time workspace packages under the `@company` scope. Apps consume them
via `workspace:*` — **platform is never a runtime service** that apps call
(AGENTS.md → Repo & deployment law §3).

## Dependency law

- `platform/**` imports nothing from `apps/` and nothing app-specific.
- `apps/<a>` never imports `apps/<b>`.
- Enforced by `scripts/ci/import-lint.ts` (runs in `ci.yml`); violations
  fail CI.

## Packages

| Package | Surface |
| --- | --- |
| `@company/auth` | `verifyIdToken(issuer, jwks)` · `sessionPlugin` (8h) · `requireRole(...)` · `rolesMatrix` |
| `@company/audit` | `auditWriter(tx, event)` same-tx · `audited()` · SIEM JSON-lines |
| `@company/crypto` | `fieldCipher` AES-256-GCM envelope · KMS iface (`AwsKmsProvider`, `InMemoryKMS`) · rotation |
| `@company/db` | `migrationRunner` (raw SQL + down.sql) · `appDb` binding · `paginate` (cursor) |
| `@company/http` | `httpPlugin` error envelope + code registry · `X-Request-ID` · rateLimit presets · healthz/readyz |
| `@company/observability` | `metricsRegistry` (namespaced) · JSON log schema · `alertManifest` |
| `@company/testing` | `pgHarness` · `seederFramework` · `k6ScenarioBuilder` · keyboard-mode helpers |
| `@company/ui` | Tailwind preset · `QueueTable` · `useKeyboardNav` · i18next wrapper · axe-clean |
| `@company/deploy` | Dockerfile.base · blue/green + migration-job templates · `envVarRegistry` |

## Publish gate (stable-API packages)

Publishing a platform package to the private registry requires **all** of:

1. Its own test suite passing (`pnpm --filter @company/<pkg> test`).
2. A `CHANGELOG.md` entry for the release (changesets — `pnpm changeset`).
3. A stable-API ADR in `docs/adr/` approving the public surface.

`access: restricted` in `.changeset/config.json` — packages publish to the
private registry only, never public npm.
