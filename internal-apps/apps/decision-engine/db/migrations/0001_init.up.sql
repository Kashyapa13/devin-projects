-- decision_db init (ADR-0018): engine's OWN database, per-app isolation.
CREATE TABLE shadow_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       text NOT NULL,
  signal_version int NOT NULL,
  inputs        jsonb NOT NULL,            -- full case_signals v1 payload
  pack_id       text NOT NULL,
  pack_version  text NOT NULL,             -- strategy version in the AML trail
  fired_rule    text NOT NULL,
  decision      text NOT NULL CHECK (decision IN ('APPROVE','IN_REVIEW','ESCALATE')),
  reason_code   text NOT NULL,
  confidence    real NOT NULL,
  rung          text NOT NULL DEFAULT 'SHADOW',
  frozen        boolean NOT NULL DEFAULT false,  -- kill-switch freeze
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shadow_decisions_case_idx ON shadow_decisions (case_id, created_at DESC);

CREATE TABLE engine_state (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO engine_state (key, value) VALUES ('kill_switch', 'false');

CREATE TABLE daily_reports (
  day      date PRIMARY KEY,
  report   jsonb NOT NULL,                 -- decisions by band, confidence dist, disagreements
  created_at timestamptz NOT NULL DEFAULT now()
);
