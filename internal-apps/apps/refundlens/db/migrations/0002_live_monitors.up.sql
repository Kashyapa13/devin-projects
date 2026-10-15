-- RefundLens 0002 — live tier + monitors-as-code (ADR-0015/0016).
-- Additive only; down.sql drops the new objects.

-- Heatmap grain: hour-of-day × day-of-week (§4.2 signature widget).
CREATE TABLE refundlens.agg_hourly (
  day date NOT NULL,
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  channel text NOT NULL,
  reason_code text NOT NULL,
  cnt bigint NOT NULL,
  amount bigint NOT NULL,
  PRIMARY KEY (day, hour, channel, reason_code)
);

-- Monitors-as-code: versioned definitions, evaluated every beat.
CREATE TABLE refundlens.monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  metric text NOT NULL,              -- series key the evaluator resolves
  window text NOT NULL,              -- e.g. '5m', '1h', '24h'
  condition text NOT NULL,           -- 'gt' | 'lt' | 'zscore_gt' | 'age_gt'
  threshold jsonb NOT NULL,
  severity text NOT NULL DEFAULT 'ticket'
    CHECK (severity IN ('page','ticket','info')),
  owner text NOT NULL,
  channel text NOT NULL DEFAULT 'slack',
  enabled bool NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Firing history — the monitoring audit trail.
CREATE TABLE refundlens.monitor_events (
  id bigserial PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES refundlens.monitors(id),
  fired_at timestamptz NOT NULL DEFAULT now(),
  value jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('firing','resolved'))
);

-- Seed monitors (ADR-0016 §monitors): the heartbeat watching itself,
-- plus the three business monitors the spec names.
INSERT INTO refundlens.monitors
  (name, metric, window, condition, threshold, severity, owner) VALUES
  ('heartbeat-age',   'heartbeat_age_s',    '1m',  'age_gt',    '{"seconds":300}', 'page',   'refundlens-ops'),
  ('refund-rate-z',   'refund_rate_zscore', '24h', 'zscore_gt', '{"z":3}',         'ticket', 'refundlens-ops'),
  ('volume-anomaly',  'refund_volume',      '24h', 'zscore_gt', '{"z":3}',         'ticket', 'refundlens-ops'),
  ('backlog-age',     'backlog_oldest_h',   '1h',  'gt',        '{"hours":72}',    'ticket', 'refundlens-ops');

-- Grants follow the 0001 role law: app reads surfaces it renders;
-- etl owns the write lane; monitors are admin-managed via the API.
GRANT SELECT ON refundlens.agg_hourly,
              refundlens.monitors,
              refundlens.monitor_events
  TO refundlens_app;
GRANT INSERT, UPDATE ON refundlens.monitors TO refundlens_app;
GRANT SELECT, INSERT, UPDATE ON refundlens.agg_hourly TO refundlens_etl;
GRANT SELECT ON refundlens.monitors TO refundlens_etl;
GRANT INSERT ON refundlens.monitor_events TO refundlens_etl;
GRANT USAGE ON SEQUENCE refundlens.monitor_events_id_seq TO refundlens_etl;
