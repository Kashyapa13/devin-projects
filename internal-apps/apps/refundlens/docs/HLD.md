# RefundLens — HLD

Refunds answer service (Tier-2, Devin-built; fork). Press release:
docs/comparison/press-releases/refundlens.md — the doc the promises trace to.

## Architecture (§4.2 — rollup store)

prod refunds DB ──hourly ETL──▶ READ REPLICA (REPLICA_DSN; never primary)
        │   idempotent UPSERT on (id, updated_at) → refund_events_raw
        │   one-transaction agg_daily rebuild → sync_runs row every run
        ▼
RefundLens Postgres rollup store ──SELECT-only app role──▶ API
        ├── typed-param view renderer (client sends params, never SQL)
        └── NL→SQL ask engine behind the fence (six fences + AST; §3)
Every answer surface carries the sync watermark — banner + page on lag.

## Tradeoff tables (chosen + rejected with cost)

### Source & sync

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Data path | Own rollup store fed by hourly ETL off the read replica | Direct replica reads — source schema drift breaks the app silently, and Tier-2 uptime becomes coupled to prod load; warehouse/dbt — a second BI stack stood up for one app at pilot scale |
| Sync shape | full+delta UPSERT idempotent on (id, updated_at); agg_daily rebuilt in ONE transaction; sync_runs row every run, success or failure | Streaming/CDC — pipeline infrastructure heavier than the app it feeds; sync without sync_runs — freshness becomes unverifiable, which makes the watermark lie |

### Store

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Rollup engine | Postgres raw + agg_daily, one DB, migrations in-app | DuckDB/parquet — superb analytics buy a second engine, a second ops story, a second bus factor |
| Query target | Views hit agg_daily; raw events reachable only through the fenced ask path | Everything on raw — p95 blows the <60s answer promise on a 5M-row table |

### Answer paths

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Ask box | Deterministic NL→SQL generated behind the fence | Canned templates only — the ask box becomes a dropdown, users retreat to analyst tickets, and the <60s promise dies as a form; unfenced generation — rejected outright (write/cost risk, no best-effort) |
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

## The fork (evidence-gated — do not pre-judge)

Console-first build with the ask box shipped instrumented, not decided.
Falsifier, pre-committed (ROUTING-PLAYBOOK door map: two-way, team-level):

- **Evidence:** scripts/fork_report.ts, run weekly, splits sessions
  ask-vs-filter from `ask_log` (which is itself a banned table for the
  fence — evidence reads it, the ask path may not).
- **Threshold:** at 4 weeks post-GA, ask-box <20% of sessions → draft the
  retirement ADR, notify the owner in the PR.
- **On retirement:** conversational layer removed; reporting
  consolidates in Power BI (already inside the $250k line) — the lanes
  stay complementary, the falsifier keeps the split honest.
- **Before the date:** ask_log, the report, and the instrumentation are
  untouchable. Removing evidence early = pre-judging the fork =
  STOP-condition (AGENTS §9).
- Tracked as OPEN-1 #conversational-vs-pbi with owner + dated trigger.
