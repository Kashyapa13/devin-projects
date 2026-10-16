# RefundLens — HLD

Refunds answer service — THE Power BI replacement for refunds reporting
(Tier-2, Devin-built; ADR-0019). Press release:
docs/comparison/press-releases/refundlens.md — the doc the promises trace to.

## Architecture (§4.2 — rollup store, two-tier live per ADR-0016)

prod refunds DB ──heartbeat delta (30–60s)──▶ READ REPLICA (REPLICA_DSN; never primary)
             ──hourly reconciliation (full+delta)──▶ same replica
        │   idempotent UPSERT on (id, updated_at) → refund_events_raw
        │   live-window aggregate recompute + one-transaction agg rebuilds
        │   → sync_runs row every run (a beat skipped = degraded beat, never silent)
        ▼
RefundLens Postgres rollup store ──SELECT-only app role──▶ API
        ├── typed-param view renderer (client sends params, never SQL)
        ├── NL→SQL ask engine behind the fence (six fences + AST; §3)
        ├── SSE /api/stream/heartbeat — widgets re-bind, NEVER full reload
        └── monitors-as-code evaluated per beat → Slack + monitor panel
Every surface carries the watermark — banner + page on lag; the heartbeat
dot shows last-event age (green <2min · amber 2–5 · red beyond).

## Tradeoff tables (chosen + rejected with cost)

### Source & sync

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Data path | Own rollup store fed by two-tier sync off the read replica (ADR-0016: 30–60s heartbeat delta + hourly reconciliation) | Direct replica reads — source schema drift breaks the app silently, and Tier-2 uptime becomes coupled to prod load; warehouse/dbt — a second BI stack stood up for one app at pilot scale |
| Sync shape | full+delta UPSERT idempotent on (id, updated_at); agg rebuilt in ONE transaction; sync_runs row every run, success or failure; skipped beat = degraded beat, never silent | Streaming/CDC (Debezium+Kafka) — pipeline infrastructure heavier than the app it feeds at 60-eng pilot scale (revisitable via ADR if 30–60s freshness ever proves insufficient); hourly-only ETL — a BI replacement with hour-old data fails the live claim; sync without sync_runs — freshness becomes unverifiable, which makes the watermark lie |

### Store

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Rollup engine | Postgres raw + agg_daily + agg_hourly (heatmap grain), one DB, migrations in-app | DuckDB/parquet — superb analytics buy a second engine, a second ops story, a second bus factor |
| Query target | Views hit agg_daily; raw events reachable only through the fenced ask path | Everything on raw — p95 blows the <60s answer promise on a 5M-row table |

### Answer paths

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Ask box | Deterministic NL→SQL generated behind the fence; ONE instrumented feature — keep/retire at 4 weeks on usage evidence | Canned templates only — the ask box becomes a dropdown, users retreat to analyst tickets, and the <60s promise dies as a form; pre-judging costs a dead conversational layer (<20% sessions → retire via ADR amendment); unfenced generation — rejected outright (write/cost risk, no best-effort) |
| Dashboard | THE surface (ADR-0019 — Datadog/BI-grade widget bar: KPI stat row, multi-series time charts, hour×dow heatmap, donut, top-N bars, scatter, cross-filter, compare-to-previous) | A plain console — invalidates the Power BI replacement claim outright |
| Widget data law | Every widget = a server-computed series via the SAME fenced template/aggregation layer — typed params only | Any client-side SQL or bespoke per-widget query path — bypasses the fence; the BI bar buys ZERO fence exceptions |
| Console views | Typed params {dim,metric,from,to,filters[]} rendered server-side | Client-composed SQL — an injection surface that also bypasses the fence entirely |

### Serving & staleness

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Answer cache | 60s TTL keyed by normalized-SQL hash; hit returns identical envelope, took_ms = cache_ms | No cache — repeat questions pay full query latency against the <60s promise; long TTL — staleness quietly exceeds what the watermark advertises |
| Exports | Bypass cache; exact counts only; watermark in CSV header comment | Cached exports — a wrong number with fresh paint; estimated counts — violates "never silently wrong" outright |
| Staleness truth | Watermark on EVERY surface; amber banner on all pages at lag >90m | Silent staleness — wrong answers served with no signal; ranked P1 by AGENTS §3 |

## The fence (six fences + AST — all mandatory)

read-only DB role · single schema allowlist · mandatory LIMIT (default
500, max 5000) · statement_timeout 5s · EXPLAIN cost cap (total cost
>5000 → reject with guidance) · banned tables (ask_log, sync_runs,
anything outside the refundlens schema). Post-generation validation is
AST parsing — never regex. Every violation returns
{error:{code:"fenced_query_rejected",...}} — never a best effort.
Client views NEVER submit SQL — typed params only, rendered server-side
by the same template library. Full spec + rejection contract: LLD §Fence.

## The fork (closed for the domain — ADR-0019; ask-box fork remains)

The console-vs-PBI fork is DECIDED: RefundLens is the Power BI
replacement for refunds reporting (ADR-0019). What remains open is the
ASK BOX's own keep/retire evaluation — now one instrumented feature, not
the app's identity:

- **Evidence:** scripts/fork_report.ts, run weekly, splits sessions
  ask-vs-filter from `ask_log` (which is itself a banned table for the
  fence — evidence reads it, the ask path may not).
- **Threshold:** at 4 weeks post-GA, ask-box <20% of sessions → draft the
  retirement ADR, notify the owner in the PR.
- **On retirement:** the conversational layer is removed; the dashboard
  (the app's identity) is unaffected — it was never on the fork.
- **Before the date:** ask_log, the report, and the instrumentation are
  untouchable. Removing evidence early = pre-judging the fork =
  STOP-condition (AGENTS §9).
- Tracked as OPEN-1 #askbox-keep-retire with owner + dated trigger
  (the prior #conversational-vs-pbi entry closed by ADR-0019).
