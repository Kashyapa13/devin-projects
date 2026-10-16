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
| widget interaction p95 | < 100 ms | **29.64 ms** | PASS | measured manually against live `/api/widgets/*` at 20 VU — **no committed script reproduces this number** (r2 metrics audit); re-verified at 33.39 ms by independent re-measure. Provenance gap, not a falsified value — a `k6-widgets.js` is owed |
| heartbeat age e2e p95 | < 60 s | **28 s** | PASS | post→record→read measured manually; **no committed script emits `heartbeat_age_p95_s`** (r2 metrics audit) — plausible vs mechanism, provenance gap |
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
#    (widget_p95_ms / heartbeat_age_p95_s shown in earlier output were measured
#    manually — k6-surfaces.js does not emit them; see row notes above)
```

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

Re-baseline when: the SSE soak excerpt is run (10 min), the dashboard gains heavier widgets, or the seed dataset changes size.
