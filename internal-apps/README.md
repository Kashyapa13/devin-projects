# internal-apps

Internal tools program — the Devin-built lane. Power Apps (forms) and Power BI
(reporting) live outside this repo; commodities are bought, never built.
See `AGENTS.md` for the root constitution.

## Index

- Constitution — [AGENTS.md](AGENTS.md)
- Decisions — [docs/adr/](docs/adr/): [0001 three-lane routing](docs/adr/0001-three-lane-routing.md) · [0002 flags stay-put](docs/adr/0002-flags-stay-on-power-apps.md) · [0015 decision engine](docs/adr/0015-decision-engine.md) · [0018 fleet visual language](docs/adr/0018-fleet-visual-language.md)
- Lane facts — [docs/comparison/FACTS.md](docs/comparison/FACTS.md)
- Ship gate — [docs/security/PROD-READINESS-CHECKLIST.md](docs/security/PROD-READINESS-CHECKLIST.md)
- Environments — [infra/ENVIRONMENTS.md](infra/ENVIRONMENTS.md)
- Program — [docs/program/ROLES.md](docs/program/ROLES.md) · [docs/program/ONCALL.md](docs/program/ONCALL.md)
- VP demo — [docs/site/](docs/site/) (script: [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md))

## Apps

| App | Tier | Data class | SLO | What it is |
| --- | --- | --- | --- | --- |
| `apps/fastlane` | Tier-1 | C4 | 99.9% | KYC review queue — keyboard-day triage, audited decisions, masked-PII reveal |
| `apps/refundlens` | Tier-2 | C3 | 99.5% | Refund analytics — fenced NL→SQL ask box + BI-grade live dashboard |
| `apps/decision-engine` | Tier-2 | C2 | 99.5% | SHADOW-rung decision engine — strategy packs score cases, humans still decide |
| `apps/flags` | — | — | — | capability demo replica (labeled "production continues on Power Apps") |

New app = `cp -r apps/_template apps/<name>` — see `.devin/skills/app-building`.

## System diagrams

### Fleet map

```mermaid
flowchart LR
    subgraph Lanes
        PA[Power Apps<br/>forms + approvals<br/>outside this repo]
        DE[Devin-built apps<br/>this repo]
        PBI[Power BI<br/>reporting<br/>outside this repo]
    end
    subgraph internal-apps
        FL[apps/fastlane]
        RL[apps/refundlens]
        ENG[apps/decision-engine]
        FLG[apps/flags<br/>capability demo]
        PLAT[platform/packages<br/>@company/ui · auth · audit<br/>crypto · db · http · otel · testing]
    end
    FL & RL & ENG & FLG --> PLAT
    PA -. stay-put decision<br/>ADR-0002 .-> FLG
    RL -. BI replacement<br/>ADR-0019 .-> PBI
    ENG -. audit mirror<br/>API-only .-> FL
```

### FastLane (Tier-1 KYC queue)

```mermaid
flowchart LR
    U[reviewer / supervisor<br/>auditor read-only] --> W[web :5173<br/>React 19 PWA<br/>queue + case]
    W -->|/api/v1 proxied| A[api :8080<br/>Fastify + TypeBox<br/>RBAC + idempotency]
    A --> S[statemachine<br/>pure transitions<br/>both directions gated]
    A --> DB[(fastlane-pg :5432<br/>cases · audit_events<br/>case_notes)]
    A --> KMS[KMS envelope<br/>AES-256-GCM legal_name]
    A --> S3[S3 doc-url<br/>signed 15min<br/>bytes never transit API]
    A --> AUD[audit_events<br/>same-tx writes<br/>reveal logged BEFORE value]
```

### RefundLens (BI-grade refund analytics)

```mermaid
flowchart LR
    SRC[(source replica<br/>REPLICA_DSN only)] --> ETL[etl hourly<br/>UPSERT + sync_runs]
    ETL --> AGG[(agg_daily rollup<br/>rebuilt per sync)]
    U[analyst] --> W[web :5173<br/>dashboard + ask box]
    W -->|/api| A[api :8083<br/>Fastify]
    A --> F[fence<br/>NL→SQL templates<br/>AST validation]
    F -->|read-only, LIMIT ≤5000,<br/>cost cap, banned tables| DB[(refundlens-pg :5433)]
    A --> C[AnswerCache 60s<br/>watermark on every answer]
    A --> HB[heartbeat → SSE<br/>widgets re-bind live<br/>stalled beat → amber/red]
    AGG --> DB
    A --> EXP[export.csv<br/>exact counts · bypasses cache]
```

### decision-engine (SHADOW rung — ADR-0015)

```mermaid
flowchart LR
    SIG[case_signals v1<br/>risk_score + country real;<br/>rest via MockModelScoreProvider] --> E[engine<br/>deterministic rule eval]
    P[strategies/packs.ts<br/>5 seed packs<br/>declared precedence<br/>TUNE-ME thresholds] --> E
    E --> D[(decision_db — local pg<br/>decision + inputs + pack<br/>+ fired rule + confidence)]
    D --> M[audit mirror → FastLane<br/>API-only contract]
    D --> R[daily shadow report<br/>agreement vs human]
    K[kill switch<br/>ENGINE_KILLED] -->|one click: all-human,<br/>in-flight frozen| E
    G[golden set 220<br/>+ pack suites in CI] -. gate .-> P
```

### flags capability demo (labeled; production stays on Power Apps)

```mermaid
flowchart LR
    U[demo user] --> W[web :5175<br/>CRUD + env tabs + /demo]
    W -->|/api/flags| A[api :8082]
    A --> DB[(flags-pg :5434<br/>flags key×env · audit)]
    A --> EV[eval API<br/>deterministic bucket<br/>SWR cache · p95 <50ms]
    EV -->|demo-hero| W
    RBAC[flag_editor non-prod<br/>flag_admin prod] --> A
```

## Run it locally

Prereqs: `pnpm install` at this directory · `docker compose up -d` starts the
dev databases (`fastlane-pg :5432` · `refundlens-pg :5433` · `flags-pg :5434`)
plus `slack-stub` and `mailhog`. One database per app — by law, not convention.

### FastLane — the keyboard-day workflow

```bash
export DATABASE_URL=postgres://fastlane:fastlane-dev@localhost:5432/fastlane
pnpm --filter @app/fastlane migrate
pnpm --filter @app/fastlane seed        # kyc-seed-v1: queue + breaching case
pnpm --filter @app/fastlane exec tsx api/src/server.ts &   # api :8080
pnpm --filter @app/fastlane exec vite web                # web :5173
```

Simulate: mint a reviewer token (`pnpm --filter @app/fastlane exec tsx scripts/mint-token.ts`),
drive `/queue` with `j/k` navigate · `Enter` open · `c` claim · `a` approve ·
`r` reject-with-reason · `p` reveal (masked PII → audited reveal). End-to-end:
`pnpm --filter @app/fastlane test:ft` (Playwright, keyboard-only, both motion
modes). One-command demo state: `../scripts/demo-reseed.sh`.

### RefundLens — ask + live dashboard

```bash
export DATABASE_URL=postgres://refundlens:refundlens-dev@localhost:5433/refundlens
pnpm --filter @app/refundlens migrate
pnpm --filter @app/refundlens seed      # refund-seed-v1
pnpm --filter @app/refundlens etl       # builds agg_daily — required before asking
PORT=8083 pnpm --filter @app/refundlens exec tsx api/src/server.ts &
pnpm --filter @app/refundlens dev       # web :5173 (or :5174 alongside FastLane; vite proxies /api → :8083)
```

Simulate: ask "how many refunds by channel last 30 days" → inspect the fenced
SQL + watermark; open the dashboard (KPI bento, compare mode, cross-filter);
`pnpm --filter @app/refundlens heartbeat` simulates the live feed — widgets
re-bind without reload, a stalled beat turns amber then red.

### decision-engine — SHADOW rung

```bash
export DATABASE_URL=postgres://postgres@localhost:5432/decision_db  # own db
pnpm --filter @app/decision-engine exec tsx scripts/seed.ts         # signals + packs
pnpm --filter @app/decision-engine dev                              # api :8081 + web
```

Simulate: `POST /api/v1/engine/decide` with a case_id → decision row with
inputs, pack version, fired rule, confidence; `GET /api/v1/engine/reports/daily` is
the daily shadow readout; the kill switch (`/api/v1/engine/kill-switch`, release via `/api/v1/engine/kill-switch/release`) freezes
in-flight and returns all-human. The 220-case golden set + pack suites run
in `pnpm --filter @app/decision-engine test`.

### flags — capability demo replica

```bash
export DATABASE_URL=postgres://flags:flags-dev@localhost:5434/flags
pnpm --filter @app/flags migrate && pnpm --filter @app/flags seed
pnpm --filter @app/flags dev   # api :8082 + web :5175
```

Simulate: create a `demo-*` flag → flip `demo-hero` dev → watch the `/demo`
section change live → typed-confirm delete → audit row on every mutation.
`flag_editor` is non-prod only; `flag_admin` flips prod. Every surface is
labeled *capability demo — production continues on Power Apps*.

### Verifying changes

`pnpm -r lint` (typecheck) · `pnpm -r test` (unit+integration) ·
`pnpm -r build` · per-app Playwright (`test:ft`) · k6 budgets under
`apps/*/perf/` · the constitution's gates run in `.github/workflows/`.
