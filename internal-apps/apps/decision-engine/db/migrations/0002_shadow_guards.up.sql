-- Guardrail tables: durable audit outbox (FastLane mirror via ADR-0015
-- contract) + human-outcome snapshots for SHADOW disagreement measurement.
CREATE TABLE human_outcomes (
  case_id   text PRIMARY KEY,
  outcome   text NOT NULL,                 -- human decision as recorded in FastLane
  reason    text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE decision_outbox (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decision_id uuid NOT NULL REFERENCES shadow_decisions(id),
  payload    jsonb NOT NULL,               -- mirror event for FastLane audit API
  sent_at    timestamptz,                  -- NULL = pending relay (durable retry)
  attempts   int NOT NULL DEFAULT 0
);
CREATE INDEX decision_outbox_pending_idx ON decision_outbox (id) WHERE sent_at IS NULL;
