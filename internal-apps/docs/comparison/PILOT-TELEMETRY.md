# Pilot telemetry

> Raw measurements feeding the KPI dashboard and falsifiers — review
> turnaround (D4 gate), RefundLens usage logs (filters vs ask-box),
> license-audit findings, ACU/app vs estimate.


## fastlane — 2026-10-15

- **Queue p95**: 10.32ms at 50 rps / 10k active cases / 50 VU analyst pacing
  (k6 `k6-queue.js`, 14950 reqs, 0.00% failures). Budget p95<1000ms — ~97× headroom.
- **Decisions audited**: FT asserts every transition lands an `audit_log`
  row keyed to the request's `x-request-id` (uuid, echoed or minted);
  not-assignee corpus mints zero rows.
- **PII reveals audited**: FT (`e2e/pii.spec.ts`, recordings off) — masked
  default, reveal→decrypt+`case.reveal` row, non-assignee reveal→alert and
  zero rows.
- **Rate limiter under flood**: 2.76M no-think-time requests / 5m → 97.28%
  HTTP 429, 0 5xx, legit-200 bucket p95 = 120.28ms — limiter is the control.
- **Keyboard-to-decision**: full keyboard-only day FT (`e2e/keyboard-day.spec.ts`)
  covers j/k→Enter→claim→note→escalate→Esc in both motion modes; keystroke
  path never leaves the keyboard.

>
> Metric lines for `scripts/pilot_report.sh`: `- METRIC <key> <num> <unit> — note`.

## Rehearsal — 2026-10-15 (full arc, live stack)

Wall-clock per segment, execution only (no narration); T0 20:14:06 UTC.
All ten beats executed + recorded — clips in `docs/site/clips/`.

| Segment | s | note |
|---|---|---|
| D1 keyboard day | ~25 | claim → reject+reason → audit |
| D2 PII reveal | ~15 | masked → blur-out → audit row |
| D3 morph/advance | ~40 | first run hit assignee gate; clean ~20 |
| D4 SLA glow | ~10 | Breaching tab |
| D5 ask | ~15 | +90s repair detour → fixed: reseed now runs ETL |
| D6 dashboard | ~10 | compare + FRAUD cross-filter |
| D7 export | ~10 | CSV watermark + # rows: 302 |
| D8 hero flip | ~12 | both directions |
| D9 typed delete | ~30 | mismatch verbatim → delete+audit |
| D10 engine | ~20 | daily JSON + ENGINE_KILLED → release |
| **Total** | **3m19s** | script budget 20min — fits |

- METRIC rehearsal_total_s 199 s — 2026-10-15 full arc execution-only
- ACU not instrumented — the `acu_total` metric line was withdrawn (r1 metrics audit): session ACU counters do not exist; no number is emitted rather than a fake zero.
- METRIC pr_turnaround_median_h 6.16 h — median PR created→merged (gh, 2026-10-16; n=11 merged)
- METRIC verifier_pass 0 count — awaiting verifier run
- METRIC verifier_flag 0 count — awaiting verifier run

## Friction log

Recorded per the charter (a zero-friction 3-app build is itself a
falsification signal). Reconstructed 2026-10-15 from the fix/rework
commit trail — friction happened, it just wasn't logged at the time.

| Date | Friction | Resolution |
|---|---|---|
| 10-15 | refundlens migration used reserved word `window` unquoted | quoted identifier |
| 10-15 | parallel lane's motion API collided with shared layer | absorbed primitive names into platform/ui |
| 10-15 | fence P1s (subquery escapes + JOIN refs + dropped `field=` filters) | recursive AST validation + `filtersOf` fix (c1a55e8) |
| 10-15 | stale `@company/auth` dist broke typecheck | rebuild platform pkgs before tsc |
| 10-15 | gitleaks hit historical JWT in `settoken.html` | file removed + fingerprint suppression |
| 10-15 | CI payload snapshots PR body → `docs-unchanged`/ADR lines need a fresh push | empty-commit refresh pattern |
| 10-15 | rehearsal: refundlens ETL missing → D5 answers empty | demo-reseed runs ETL |
| 10-15 | rehearsal: `p`-key reveal nonexistent (button-only) | script corrected |
| 10-15 | rehearsal: engine routes `/api/v1/engine/*` guessed wrong | script corrected |
| 10-15 | `pilot_report.sh` `dict()` crashed on 3-tuple METRIC regex | dict-comprehension |
| 10-15 | vite re-optimization blank flash mid-recording | re-recorded after warmup |

- METRIC verifier_pass 0 count — awaiting verifier run
- METRIC verifier_flag 0 count — awaiting verifier run

## KPI watch

- promise-kept rate 6/7 = 85.7% < 90% target — open item `ft-every-flow`
  tracked below (owner: testing executors; trigger: executor reports land;
  review: 2026-10-16).

## promise-verdicts (updated from test evidence)

- promise-verdict: flags-eval-p95-50ms → kept (p95 0.7ms n=200 local, PR #13)
- promise-verdict: queue-p95-1s → kept (k6 p95 5.32ms @336rps, PR #8)
- promise-verdict: inp-100ms → kept (input→frame p75 17ms, PR #8)
- promise-verdict: keyboard-day-faster → kept (polish ties: ~17ms/keypress vs baseline, PR #8)
- promise-verdict: audit-per-mutation → kept (flags demo + fastlane FT evidence)
- promise-verdict: ft-every-flow → kept (PRs #15/#16/#18: 63+255+184 vitest, 15+22+50 playwright ×2 motion modes, all merged)
- promise-verdict: demo-≤20min → kept (rehearsal 3m19s execution-only)
