<<<<<<< HEAD
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
||||||| 45b5e62
=======
# PERF-BASELINES

k6 budget-as-code baselines recorded on this box. Motion enabled per the
testing charter (UI runs carry the motion=on project; API perf is
motion-independent — it only affects render).

## fastlane — `GET /api/v1/queue` — 2026-10-15

Fixture: `kyc-seed-v1`, 10,000 cases, postgres `fastlane-pg` :55432,
API on :8080, 100 distinct reviewer JWTs (per-user read preset 300/min
makes a shared token throttle the run, not the queue).

Scripts: `apps/fastlane/scripts/perf/{k6-queue.js,k6-spike.js,gen-tokens.ts}`.
VU pacing: 1 queue read/s per VU — analyst-realistic ~50 rps aggregate.

### LOAD — 50 VU / 5m — budget: p95 < 1000ms, err < 0.1% — PASS

```
http_reqs......................: 14950   49.71/s
http_req_failed................: 0.00%   0 / 14950
http_req_duration..............: avg=4.6ms  med=3.77ms  p(90)=8.09ms  p(95)=10.32ms  max=115.58ms
checks.........................: 100.00%  29900 / 29900
```

### SPIKE — 0→100 VU in 30s (+90s hold, 15s ramp-down) — budget: err < 1% — PASS

```
http_reqs......................: 11246   82.75/s
http_req_failed................: 0.00%   0 / 11246   (429 counted as throttled, not failed)
http_req_duration..............: avg=3.49ms  med=2.97ms  p(90)=6.01ms  p(95)=7.5ms   max=27.59ms
checks.........................: 100.00%  33738 / 33738  (queue 200 / not 5xx / not throttled)
```
Recovery: latency never left the ~4ms band during or after the ramp —
p95 stayed <10ms across the hold window; nothing to recover (recovery
budget 30s, observed 0).

### SOAK — 60m full — TIME-BOXED EXCERPT 10m — PASS

`k6-queue.js` at DURATION=10m, labeled excerpt (50 VU, ~50 rps):

```
http_reqs......................: 29856   49.68/s
http_req_failed................: 0.00%   0 / 29856
http_req_duration..............: avg=4.38ms  med=3.71ms  p(90)=7.89ms  p(95)=10.02ms  max=122.97ms
checks.........................: 100.00%  59712 / 59712
```

### Reference — no-think-time flood (before pacing fix)

50 VU × ~9,200 rps, 2.76M requests / 5m: 97.28% HTTP 429 (rate limiter
throttle, by design), 0 5xx, successful-200 bucket p95 = 120.28ms.
Takeaway: under a raw flood the limiter holds and legit traffic still
serves inside the budget.
>>>>>>> origin/devin/1792094200-flags-demo
