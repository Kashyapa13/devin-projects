# PERF-BASELINES — recorded budgets

Budget-as-code results (TESTING.md §PERF). Each row: budget → measured → verdict,
with the command that produced it. Numbers are from the deterministic
`refund-seed-v1` dataset (5,432 events, 12-month span) on the dev harness
(postgres:16-alpine @ :55433, API :8080, web :5174).

## RefundLens — run 2026-10-15 (skeleton base `devin/1792083395`)

| Surface | Budget | Measured | Verdict | Notes |
| --- | --- | --- | --- | --- |
| ask p95 @ 20 VU | < 2500 ms | **4.50 ms** | PASS | 293,899 iters / 30 s, 4-question corpus |
| cache-hit ratio (steady) | > 60 % | **100 %** | PASS | 60 s TTL + small question space saturates |
| first paint p95 (web shell) | < 2000 ms | **12.68 ms** | PASS | `GET /` on vite dev server; /view dashboard unrouted (skeleton) |
| widget interaction p95 | < 100 ms | **2.63 ms** | PASS (proxy) | no `/api/widgets/*` routes on skeleton — measured the fenced ask round-trip; re-baseline when widgets land |
| heartbeat age e2e p95 | < 60 s | n/a | NOT RUN | `/api/stream/heartbeat` unrouted on skeleton — F-09..F-17 gap, recorded in `e2e/export-and-catalog.spec.ts` |
| SSE soak | 8 h aspirational / ≥10 min excerpt | n/a | NOT RUN | same reason — no SSE route exists to soak |

### Commands

```bash
TOKEN=$(pnpm -s dev-token) k6 run --env TOKEN=$TOKEN --env VUS=20 --env DURATION=30s \
  apps/refundlens/scripts/perf/k6-ask.js
# → {"ask_p95_ms":4.50,"budget_ask_p95_ms":2500,"ask_p95_ok":true,
#    "cache_hit_ratio":"1.000","budget_cache_hit":0.6,"cache_hit_ok":true}

TOKEN=$(pnpm -s dev-token) k6 run --env TOKEN=$TOKEN --env VUS=20 --env DURATION=15s \
  apps/refundlens/scripts/perf/k6-surfaces.js
# → {"first_paint_p95_ms":12.68,"budget_first_paint_ms":2000,"first_paint_ok":true,
#    "widget_p95_ms":2.63,"budget_widget_ms":100}
```

Re-baseline when: the dashboard lane lands (F-09..F-17 routes, real widget
latency, heartbeat age, SSE soak), or the seed dataset changes size.
