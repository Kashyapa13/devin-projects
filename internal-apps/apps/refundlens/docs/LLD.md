# RefundLens — LLD

## Core DDL (commentary — schema truth lives in db/migrations)

```sql
CREATE TABLE refund_events_raw (   -- hourly full+delta, idempotent on (id, updated_at)
  id bigint PRIMARY KEY, txn_ref text, occurred_at timestamptz, channel text,
  merchant_segment text, amount_cents bigint, reason_code text,
  state text, latency_ms int, updated_at timestamptz NOT NULL,
  ingested_at timestamptz DEFAULT now()
);
CREATE TABLE agg_daily (           -- rebuilt after each sync; queries hit this
  day date, channel text, merchant_segment text, reason_code text,
  cnt bigint, amount bigint, p50_ms int, p95_ms int,
  PRIMARY KEY (day, channel, merchant_segment, reason_code)
);
CREATE TABLE sync_runs (id bigserial, watermark timestamptz, rows int,
  status text, finished_at timestamptz);
CREATE TABLE ask_log (            -- the fork's evidence + shows-its-work history
  id uuid PRIMARY KEY, user_id uuid, question text, rendered_sql text,
  ms int, rows int, success bool, created_at timestamptz DEFAULT now()
);
```

## API registry

POST /ask {question} → {answer, sql, rows, watermark, took_ms} (60s
hash-cache) · GET /view?dim&metric&from&to&filters (query-param state →
shareable) · GET /ask/:id + /ask/me/history · GET /export.csv (exact counts,
watermark in header comment, bypasses cache) · GET /health/sync (watermark +
lag; amber banner past 90min).

## Deployment

Tier-2 99.5%, single-AZ app + multi-AZ DB, RTO 4h; ETL as scheduled job with
lag alerting.

## KPIs

median time-to-answer <60s · ask-vs-filter split (the fork trigger) ·
export count · stale-banner incidence.
