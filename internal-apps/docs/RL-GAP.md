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
| W1 | ONE charting foundation | **GAP** | `platform/packages/ui/src/charts/` — SVG primitives (Sparkline, TimeSeries, Heatmap, Donut, Bars, Scatter); zero new deps; motion primitives drive draw-in |
| W2 | KPI stat row (8 cards: sparkline + delta + click-through) | **GAP** | widget `kpi` + cards row |
| W3 | Multi-series time charts + threshold band + z-score markers | **GAP** | widget `timeseries` (series by channel/segment, stacked opt) + anomaly computation server-side, labeled "heuristic" |
| W4 | Hour × day-of-week HEATMAP | **GAP** | widget `heatmap` on `agg_hourly` |
| W5 | Donut by reason code | **GAP** | widget `donut` |
| W6 | Top-N bars (count/amount/rate, sortable) | **GAP** | widget `topn` |
| W7 | Latency-vs-amount scatter | **GAP** | widget `scatter` (density shading) |
| W8 | Top-N tables (merchants, reason codes) | **GAP** | widget `table` rows |
| W9 | CROSS-FILTER (click → filters detail + vice versa) | **GAP** | dashboard state: click sets global filter → detail table re-queries |
| W10 | Compare-to-previous (period-over-period deltas) | **GAP** | `compare=1` → deltas on every widget (server-computed) |
| W11 | Global bar (24h–12M ranges, filters, saved shareable views) | **GAP** | query-param state = saved views |

### (b) Live tier (ADR-0016)

| # | Item | Verdict | Work item |
|---|---|---|---|
| L1 | 30–60s heartbeat delta sync off replica | **GAP** | `scripts/heartbeat.ts` (idempotent delta upsert + live-window recompute) |
| L2 | Hourly reconciliation | **already met** | existing `etl.ts` stays the reconciliation pass |
| L3 | `GET /api/stream/heartbeat` SSE | **GAP** | fastify SSE route; beats push `{watermark, last_event_at, rows}` |
| L4 | Breathing live dot (green <2m · amber 2–5 · red >5, tooltip = watermark + last-event age) | **GAP** | `LiveDot` component; state from SSE beat age |
| L5 | Widgets re-bind on events — NEVER reload | **GAP** | SSE event → query refetch per widget (TanStack invalidate) |
| L6 | Last-24h live tail (minute grain) | **GAP** | `timeseries` accepts `grain=minute` window 24h |

### (c) Monitors-as-code (ADR-0016)

| # | Item | Verdict | Work item |
|---|---|---|---|
| M1 | Versioned monitor defs + eval per beat | **GAP** | `monitors` table (migrated) + `monitors/` evaluator; defs versioned + tested |
| M2 | Firing → Slack stub + `monitor_events` | **GAP** | webhook stub endpoint for tests; events row per fire |
| M3 | Seed monitors: heartbeat-age, refund-rate z-score, volume anomaly, backlog age | **GAP** | four defs shipped in migration/seed |
| M4 | Monitor panel widget + `/monitors` admin | **GAP** | F-11 surface |

### (d) Data

| # | Item | Verdict | Work item |
|---|---|---|---|
| D1 | `agg_hourly` grain | **GAP** | migration 0002 + etl/heartbeat recompute |
| D2 | Seed hour-of-day + day-of-week patterns | **GAP** | extend seed.ts (keep 5,432 exact count — redistribute occurred_at, don't change total) |
| D3 | `monitors`/`monitor_events` DDL | **GAP** | migration 0002 |
| D4 | Widget endpoint `/api/widgets/:name` via SAME fenced layer | **GAP** | typed params → template render → read-only exec (fence already exists — widgets reuse `ask/executor` path verbatim) |

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
