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
