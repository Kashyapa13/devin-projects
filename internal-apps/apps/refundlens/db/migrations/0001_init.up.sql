-- RefundLens initial schema (expand-contract: additive first).
-- Raw SQL reviewed per constitution; down.sql in CI-tested pair.
-- Single-schema law: everything lives in `refundlens` — the fence's
-- schema allowlist is enforced against this namespace (LLD §fence).

CREATE SCHEMA IF NOT EXISTS refundlens;

-- Raw refund events, upserted hourly by ETL off the READ REPLICA.
-- Idempotent on (id, updated_at) — replays produce zero delta.
CREATE TABLE refundlens.refund_events_raw (
  id bigint PRIMARY KEY,
  txn_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  channel text NOT NULL,
  merchant_segment text NOT NULL,
  amount_cents bigint NOT NULL,
  reason_code text NOT NULL,
  state text NOT NULL,
  latency_ms int,
  updated_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX raw_by_updated ON refundlens.refund_events_raw (updated_at);
CREATE INDEX raw_by_day_channel ON refundlens.refund_events_raw
  (occurred_at, channel, merchant_segment, reason_code);

-- Pre-aggregated view target — rebuilt in ONE transaction after each sync.
CREATE TABLE refundlens.agg_daily (
  day date NOT NULL,
  channel text NOT NULL,
  merchant_segment text NOT NULL,
  reason_code text NOT NULL,
  cnt bigint NOT NULL,
  amount bigint NOT NULL,
  p50_ms int,
  p95_ms int,
  PRIMARY KEY (day, channel, merchant_segment, reason_code)
);

-- One row per ETL run, success or failure — the watermark source of truth.
CREATE TABLE refundlens.sync_runs (
  id bigserial PRIMARY KEY,
  watermark timestamptz,
  -- cursor tiebreak: rows sharing the boundary updated_at are never skipped
  watermark_id bigint,
  rows int NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('success','error')),
  detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- The fork's evidence + shows-its-work history. BANNED from the fence —
-- readable only by fork_report, never by generated SQL.
CREATE TABLE refundlens.ask_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  surface text NOT NULL DEFAULT 'ask',
  question text NOT NULL,
  rendered_sql text,
  ms int,
  rows int,
  success bool NOT NULL,
  fence_reason text,
  req_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Roles per AGENTS.md §2. NOLOGIN group roles; login identities bind at
-- deploy (IAM/mapped users) and in tests via IN ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'refundlens_app') THEN
    CREATE ROLE refundlens_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'refundlens_etl') THEN
    CREATE ROLE refundlens_etl NOLOGIN;
  END IF;
END $$;

-- app: read-only on the data surfaces + INSERT on the evidence log (the
-- ask path must be able to write its own audit row; it cannot UPDATE or
-- DELETE anything, anywhere).
GRANT USAGE ON SCHEMA refundlens TO refundlens_app;
GRANT SELECT ON refundlens.refund_events_raw,
              refundlens.agg_daily,
              refundlens.sync_runs
  TO refundlens_app;
GRANT INSERT ON refundlens.ask_log TO refundlens_app;
GRANT USAGE ON SEQUENCE refundlens.sync_runs_id_seq TO refundlens_app;

-- etl: the write lane. INSERT/UPDATE on the data it syncs + SELECT it
-- needs for the rebuild read; INSERT on sync_runs for its own run log.
-- It cannot touch ask_log (evidence is not the pipeline's business).
GRANT USAGE ON SCHEMA refundlens TO refundlens_etl;
GRANT SELECT, INSERT, UPDATE ON refundlens.refund_events_raw TO refundlens_etl;
GRANT SELECT, INSERT, UPDATE ON refundlens.agg_daily TO refundlens_etl;
GRANT INSERT ON refundlens.sync_runs TO refundlens_etl;
GRANT USAGE ON SEQUENCE refundlens.sync_runs_id_seq TO refundlens_etl;
