# RefundLens — HLD

Refunds answer service (Tier-2, Devin-built; fork).

## Architecture

prod refunds DB → hourly ETL off READ REPLICA (never primary) → RefundLens
Postgres rollup store; API → rollup store (read-only role) + NL→SQL engine
(schema-scoped, fenced); sync watermark on every response.

## Tradeoff table (chosen + rejected with cost)

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Data path | Own rollup store via hourly ETL off replica | Direct replica — schema drift breaks silently, couples Tier-2 uptime to prod; warehouse — adds dbt/BI stack for one app at 60-eng scale |
| Storage engine | Postgres raw + agg_daily | DuckDB/parquet — superb analytics but second engine, second ops story, second bus factor |
| NL→SQL | Generated SQL, fenced | Canned templates — safe but the ask-box becomes a dropdown; users retreat to data requests; PR promise dead |
| The fork | Console-first, ask-box instrumented; 4 weeks of usage decides | Pre-judging either way — costs a 1–2 wk lane rebuild or a dead conversational layer; instead evidence-gated: ask-box <20% of sessions → retire conversational layer, reporting consolidates in Power BI (already inside the $250k) |

## The fence (all mandatory)

read-only DB role · single schema allowlist · mandatory LIMIT (default 500,
max 5000) · statement_timeout 5s · EXPLAIN cost cap (total cost >5000 →
reject with guidance) · banned tables (ask_log, sync_runs, anything outside
refundlens schema) · AST validation of generated SQL (not regex).
Violations → {error:{code:"fenced_query_rejected"}} — never a best effort.
Client views NEVER submit SQL — typed params only.
