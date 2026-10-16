# FastLane — Tier-1 KYC review queue

Constitution: `AGENTS.md` · designs: `docs/HLD.md`, `docs/LLD.md` · ops:
`docs/RUNBOOK.md` · risk: `docs/THREAT-MODEL.md`.

## Layout
`api/` (routes → services → statemachine, pure) · `web/` (keyboard-first
PWA) · `db/migrations` (raw SQL up/down pairs — schema truth) · `scripts/`
(migrate, seed "kyc-seed-v1", perf/k6-queue.js) · `openapi.yaml` (generated
— `pnpm openapi`) · `Dockerfile` (platform-deploy base).

## Dev loop
```sh
docker run -d --name fastlane-pg -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=fastlane -p 55432:5432 postgres:16-alpine
export DATABASE_URL=postgres://postgres:dev@localhost:55432/fastlane \
       SESSION_SECRET=dev-secret CRON_SECRET=dev-cron
pnpm migrate && pnpm seed          # 40 cases, 3+1 users
pnpm build && pnpm start           # api :8080
pnpm exec vite web --port 5173     # web :5173 (proxies /api)
```
`pnpm seed --cases=10000` for the perf fixture. `pnpm test` runs the
§7 gates (statemachine matrix, kill-tests, RBAC, contract drift, anchor FT).

## Telemetry (ADR-0017)
`OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP/HTTP base for the emitter
(`api/src/telemetry.ts`, `@company/otel`). Local: `http://localhost:4318`
(`internal-apps/infra/otel` compose → collector → Grafana LGTM;
Grafana :3000 anonymous admin). Prod: client's existing OTLP backend.
Unset → emitter no-ops (tests, collector-less runs). Optional:
`OTEL_TRACES_SAMPLER_RATIO` (0–1, ParentBased root ratio; default 1),
`APP_ENV` (deployment.environment.name), `OTEL_SDK_DISABLED=true`.

## Data class
C4 (legal_name) — AES-256-GCM envelope via platform-crypto; masked in every
read; reveal is an audited, rate-limited endpoint. Synthetic fixtures only.
