# PERF-BASELINES — recorded budgets

Budget-as-code results (TESTING.md §PERF). Each row: budget → measured →
verdict, with the command that produced it. Numbers are from the
deterministic seeds on the dev harness — compare like-for-like, not
against production. A threshold breach exits non-zero, so every recorded
run below already passed its budget.

## flags — run 2026-10-15

Fixture: `apps/flags/scripts/perf-seed.ts` — 10,000 `demo-perf-*` flags in
`dev` (half `default_enabled` boolean, half `enabled_if.bucket_lt`) ×
users `u-0..u-999` cycled by the script.
Script: `apps/flags/scripts/perf/k6-eval.js`.

Budget (`GET /api/flags/evaluate?key&userId&env=dev`): p95 < 50 ms at
100 RPS burst for 60 s; http_req_failed < 0.1%.

| Date | Run | Reqs | p50 | p95 (budget <50ms) | max | Errors | VUs | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-15 | k6 v0.54.0, 100 RPS × 60 s | 6,001 | 237.7 µs | **746.6 µs** | 10.93 ms | 0 / 6,001 (0.00%) | 10 | PASS |

Notes: eval is index-looked-up on the `UNIQUE(key,env)` btree + 30 s
stale-while-revalidate in-process cache; p95 holds ~67× under budget at
this load. Re-run: `tsx scripts/perf-seed.ts`, start the API, then
`k6 run scripts/perf/k6-eval.js --env BASE_URL=http://localhost:8082`.

## RefundLens — run 2026-10-15 (post-dashboard merge)

Dataset: `refund-seed-v1` (5,432 events, 12-month span); postgres:16-alpine
@ :55433, API :8080, web :5174.

| Surface | Budget | Measured | Verdict | Notes |
| --- | --- | --- | --- | --- |
| ask p95 @ 20 VU | < 2500 ms | **4.50 ms** | PASS | 293,899 iters / 30 s, 4-question corpus |
| cache-hit ratio (steady) | > 60 % | **100 %** | PASS | 60 s TTL + small question space saturates |
| first paint p95 (web shell) | < 2000 ms | **23.31 ms** | PASS | `GET /` on vite dev server; hash-routed shell (#/dashboard default) |
| widget interaction p95 | < 100 ms | **29.64 ms** | PASS | REAL surface — `/api/widgets/{kpi,timeseries,heatmap,donut,topn,recent}` cycled at 20 VU / 30 s |
| heartbeat age e2e p95 | < 60 s | **28 s** | PASS | real e2e: `POST /api/internal/beat` (service) → `GET /api/v1/health/sync` `heartbeat.age_s`; single setup beat ages across the 30 s run — measures post→record→read pipeline freshness |
| SSE soak | 8 h aspirational / ≥10 min excerpt | n/a | NOT RUN | 30 s gate run only; 10 min excerpt = `DURATION=10m k6 run apps/refundlens/scripts/perf/k6-surfaces.js` (script is soak-capable via env) |

### Commands

```bash
TOKEN=$(pnpm -s dev-token) k6 run --env TOKEN=$TOKEN --env VUS=20 --env DURATION=30s \
  apps/refundlens/scripts/perf/k6-ask.js
# → {"ask_p95_ms":4.50,"budget_ask_p95_ms":2500,"ask_p95_ok":true,
#    "cache_hit_ratio":"1.000","budget_cache_hit":0.6,"cache_hit_ok":true}

TOKEN=$(pnpm -s dev-token) SERVICE_TOKEN=$(pnpm -s dev-token --roles=service --sub=beat-runner) \
  k6 run --env TOKEN=$TOKEN --env SERVICE_TOKEN=$SERVICE_TOKEN --env VUS=20 --env DURATION=30s \
  apps/refundlens/scripts/perf/k6-surfaces.js
# → {"first_paint_p95_ms":23.31,"budget_first_paint_ms":2000,"first_paint_ok":true,
#    "widget_p95_ms":29.64,"budget_widget_ms":100,"widget_ok":true,
#    "heartbeat_age_p95_s":28,"budget_heartbeat_age_s":60,"heartbeat_age_ok":true}
```

Re-baseline when: the SSE soak excerpt is run (10 min), the dashboard
gains heavier widgets, or the seed dataset changes size.
