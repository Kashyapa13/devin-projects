# RL-GAP — RefundLens BI-dashboard retrofit audit

Phase A of the RefundLens dashboard retrofit (the §4.2 spec + ADR-0015/0016).
Posture: wrap what exists, never rewrite working flows. Two laws survive
every upgrade — **WIDGET LAW** (every widget = server-computed series via
the SAME fenced aggregation layer; the BI bar buys ZERO fence exceptions)
and **WATERMARK HONESTY** (every surface shows data-as-of).

## 1. Inventory — what exists

| Layer | State | Where |
|---|---|---|
| Screens | `/ask` only (F-02 shipped, green) | `web/src/AskPage.tsx` |
| Chart layer | **none** — no chart code anywhere in repo | — |
| Data path | hourly ETL replica→`refund_events_raw`, idempotent `(id,updated_at)` upsert, one-tx `agg_daily` rebuild, `sync_runs` every run; watermark on every envelope | `scripts/etl.ts`, `api/src/watermark.ts` |
| Filters/state | none (no views yet) | — |
| Export | `GET /api/v1/export.csv` exact counts + watermark header, bypasses cache | `api/src/routes.ts` |
| Fence | all six + AST, 30 banned-construct tests, `fenced_query_rejected` contract | `api/src/ask/{fence,ast}.ts` |
| Monitors/alerting | none | — |
| Telemetry | `/metrics` endpoint (names per §6); OTel = parallel workstream (ADR-0017) | `api/src/routes.ts` |
| Live tier | none (hourly only) | — |
| Seed | `refund-seed-v1` — 5,432 rows exact-asserted; uniform-ish times, **no hour/dow patterns** | `scripts/seed.ts` |
| Roles | `analyst` only | RBAC in routes |

## 2. Gap map vs the bar

### (a) Widgets — the Datadog/BI bar (§4.2)

| # | Item | Verdict | Work item |
|---|---|---|---|
| W1 | ONE charting foundation | **CLOSED** | `platform/packages/ui/src/charts/` — Sparkline, TimeSeries, Heatmap, Donut, TopBars, Scatter, KpiCard/KpiGrid, LiveDot; zero new deps; Reveal/stagger/CountUp drive draw-in |
| W2 | KPI stat row (8 cards: sparkline + delta + click-through) | **CLOSED** | `kpi` widget + `KpiCard/KpiGrid`; delta chip on `compare=1`; pending/at-risk cards click-through to state filter |
| W3 | Multi-series time charts + threshold band + z-score markers | **CLOSED** | `timeseries` (dim/grain/stacked toggle) + server `stats`/`anomalies` (|z|>3, cap 20) rendered as band + markers labeled "heuristic" |
| W4 | Hour × day-of-week HEATMAP | **CLOSED** | `heatmap` widget + `Heatmap` 7×24; empty cells render as empty |
| W5 | Donut by reason code | **CLOSED** | `donut` widget + `Donut` component; click filters `reason` |
| W6 | Top-N bars (count/amount/rate, sortable) | **CLOSED** | `topn` widget `sort=count|amount|rate` server-side + `TopBars` |
| W7 | Latency-vs-amount scatter | **CLOSED** | `scatter` widget + `Scatter` density-shaded |
| W8 | Top-N tables (merchants, reason codes) | **CLOSED** | `topn` rows + `detail` table (id/txn/channel/segment/amount/reason/state/latency) |
| W9 | CROSS-FILTER (click → filters detail + vice versa) | **CLOSED** | clicks write global filter params → all widgets + detail re-fetch; click again clears; clear-filters chip |
| W10 | Compare-to-previous (period-over-period deltas) | **CLOSED** | `compare=1` → every widget returns a shifted `compare` series; KPI delta chips + compare rows |
| W11 | Global bar (24h–12M ranges, filters, saved shareable views) | **CLOSED** | `#/dashboard?range&compare&channel&segment&reason&state&stacked&sort&tsdim` — saved views are links |

### (b) Live tier (ADR-0016)

| # | Item | Verdict | Work item |
|---|---|---|---|
| L1 | 30–60s heartbeat delta sync off replica | **CLOSED** | `scripts/heartbeat.ts` every `HEARTBEAT_MS` (45s default) or `--once`: runSync → evaluate → POST beat; degraded beats recorded, never silent |
| L2 | Hourly reconciliation | **already met** | existing `etl.ts` stays the reconciliation pass |
| L3 | `GET /api/stream/heartbeat` SSE | **CLOSED** | emits `{watermark,last_event_at,beat_at,rows,lag_s}` each beat + initial snapshot; `?token=` for EventSource (ADR-0018) |
| L4 | Breathing live dot (green <2m · amber 2–5 · red >5, tooltip = watermark + last-event age) | **CLOSED** | `LiveDot` — StatusSpring color + PulseOnDanger crossing; tooltip = watermark + event age |
| L5 | Widgets re-bind on events — NEVER reload | **CLOSED** | SSE beat → `queryClient.invalidateQueries(['widget'])` |
| L6 | Last-24h live tail (minute grain) | **CLOSED** | `grain=minute` accepted by `timeseries` (24h preset uses hour; minute available for the tail view) |

### (c) Monitors-as-code (ADR-0016)

| # | Item | Verdict | Work item |
|---|---|---|---|
| M1 | Versioned monitor defs + eval per beat | **CLOSED** | `monitors` (versioned, PATCH bumps version) + `monitors/evaluator.ts` per beat; firing/resolved transitions only — steady-state silent |
| M2 | Firing → Slack stub + `monitor_events` | **CLOSED** | firing → `monitor_events` row + webhook POST (SLACK_WEBHOOK_URL/MONITOR_WEBHOOK, optional); `slackStub` injectable — tested |
| M3 | Seed monitors: heartbeat-age, refund-rate z-score, volume anomaly, backlog age | **CLOSED** | four defs in migration 0002 |
| M4 | Monitor panel widget + `/monitors` admin | **CLOSED** | `monitors_panel` widget on the dashboard + GET/PATCH `/api/monitors` (admin) |

### (d) Data

| # | Item | Verdict | Work item |
|---|---|---|---|
| D1 | `agg_hourly` grain | **CLOSED** | migration 0002; rebuilt in the sync tx; sums to 5,432 (tested) |
| D2 | Seed hour-of-day + day-of-week patterns | **CLOSED** | landed in 15f4d34 — 5,432 exact |
| D3 | `monitors`/`monitor_events` DDL | **CLOSED** | migration 0002 + 0003 (monitor_events_by_monitor index — fence cost-cap fix) |
| D4 | Widget endpoint `/api/widgets/:name` via SAME fenced layer | **CLOSED** | `runWidget` → `runFenced` under `WIDGET_SCOPE` (ADR-0018); bogus/injection-ish params → `fenced_query_rejected` (tested) |

## 3. Non-gaps (already met)

Watermark plumbing on every envelope · export exact-count + header ·
fence (six + AST) — widgets inherit it for free · idempotent upsert
mechanism · sync_runs audit trail · ask box (ONE instrumented feature —
untouched beyond shared-shell consistency) · i18n shell + motion system
(ADR-0014) available to the dashboard.

## 4. Slice order (this session)

1. Migration 0002 (agg_hourly, monitors, monitor_events) + seed patterns.
2. `/api/widgets/:name` on the fenced executor + contract tests.
3. `charts/` in platform-ui + `DashboardPage` (global bar → KPI row →
   time series → heatmap → donut/topN → scatter → detail table).
4. Heartbeat script + SSE + LiveDot + re-bind wiring.
5. Monitors evaluator + Slack stub + panel widget.
6. Re-gate: bypass attempt, watermark shots, beat→SSE recording, spike
   fires a monitor, perf numbers, full test/lint sweep.
