# RUNBOOK — flags demo

Demo-tier only: `pnpm -F @app/flags dev` (api :8082, web :5173 via vite proxy).
DATABASE_URL → flags' own DB. Seed: `tsx scripts/seed.ts` (synthetic demo-*).
NOT production — the PA panel is production; zero changes to it.

## Start (local)

```
docker run -d --name flags-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=flags -p 55434:5432 postgres:16-alpine
export DATABASE_URL=postgres://postgres:dev@localhost:55434/flags
docker cp db/migrations/0001_init.up.sql flags-pg:/tmp/up.sql
docker exec flags-pg psql postgres://postgres:dev@localhost:5432/flags -f /tmp/up.sql
pnpm exec tsx scripts/seed.ts                 # synthetic demo-* flags only
pnpm dev                                      # api :8082 + web (vite)
# or the built unit: pnpm build && PORT=8082 node dist/api/src/server.js
```

Health: `GET /healthz`. Every response carries `x-demo-label` (the mandated
demo notice); every UI surface shows the same label — never remove it.

## Deploy

One OCI unit: `docker build --build-arg APP_DIR=apps_flags -f apps/flags/Dockerfile -t flags-demo:<tag> .`
(from the monorepo root). The image serves both API and the built panel —
`/` and `/demo` resolve in the container. Env: `DATABASE_URL`, `PORT`.

## Rollback

Demo-tier: redeploy the previous image tag. DB: `db/migrations/0001_init.down.sql`
drops both tables — destructive, so snapshot first if a demo dataset matters:
`docker exec flags-pg pg_dump postgres://postgres:dev@localhost:5432/flags > backup.sql`.

## Rotate secrets

Only `DATABASE_URL`. Update the deploy env + restart. No other credentials
exist — demo auth is the caller-chosen `x-demo-role` header by design (ADR-0018),
not a secret.

## Restore backup

`docker exec -i flags-pg psql postgres://postgres:dev@localhost:5432/flags < backup.sql`,
then re-seed if needed (`pnpm exec tsx scripts/seed.ts` is idempotent — `ON
CONFLICT DO NOTHING` + audit insert guarded by NOT EXISTS).

## Common incidents

- **`/demo` 404 in container** — `dist-web/` missing from the image; rebuild
  (`pnpm build` emits it) — the API's not-found handler serves the SPA.
- **Evaluates stale flag** — `flagCache.invalidate()` runs post-commit on every
  mutation; a still-stale read means a mutation path bypassed `withTx` — check logs.
- **`BAD_TARGETING` on save** — `enabled_if.bucket_lt` must be a number 0–100.
- **`RBAC` 403** — wrong `x-demo-role` for the action (viewer read / flag_editor
  non-prod / flag_admin prod + delete).
- **Audit row missing for a change** — P1-shaped bug: mutations must write flag +
  audit in the same transaction. Revert the offending path.
- **Non-`demo-*` key visible** — create path bypassed `DEMO_KEY`; the demo law is
  broken — take the panel down until fixed.
