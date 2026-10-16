-- FastLane initial schema (expand-contract: additive first).
-- Raw SQL reviewed per constitution; down.sql in CI-tested pair.
-- audit_events columns match platform-audit's auditWriter contract.

CREATE TABLE users (
  id uuid PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  roles text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE kyc_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_ref text NOT NULL,                -- C3: plaintext, logged ok
  legal_name_enc text,                       -- C4: fieldCipher envelope token
  country char(2) NOT NULL,
  risk_score smallint CHECK (risk_score BETWEEN 0 AND 100),
  doc_type text NOT NULL,
  status text NOT NULL CHECK (status IN
    ('PENDING','IN_REVIEW','APPROVED','REJECTED','ESCALATED')),
  priority text NOT NULL DEFAULT 'MED',
  assignee_id uuid REFERENCES users(id),
  sla_due_at timestamptz NOT NULL,
  version int NOT NULL DEFAULT 1,            -- optimistic locking
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX queue_active ON kyc_cases (status, sla_due_at)
  WHERE status NOT IN ('APPROVED','REJECTED');
CREATE INDEX queue_mine ON kyc_cases (assignee_id, status)
  WHERE status = 'IN_REVIEW';

-- The ONLY legal transitions (AGENTS.md §4). Table-driven: the pure
-- statemachine module reads this shape; adding an edge = ADR + re-test.
CREATE TABLE state_transitions (
  from_status text NOT NULL,
  to_status text NOT NULL,
  roles text[] NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO state_transitions (from_status, to_status, roles) VALUES
  ('PENDING',   'IN_REVIEW', '{reviewer,supervisor}'),
  ('IN_REVIEW', 'APPROVED',  '{reviewer,supervisor}'),
  ('IN_REVIEW', 'REJECTED',  '{reviewer,supervisor}'),
  ('IN_REVIEW', 'ESCALATED', '{reviewer,supervisor}'),
  ('ESCALATED', 'IN_REVIEW', '{supervisor}');

-- Append-only decision log (platform-audit column contract).
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  req_id text,
  at timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;
CREATE INDEX audit_entity ON audit_events (entity, entity_id);

CREATE TABLE case_notes (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES kyc_cases(id),
  author_id text NOT NULL,
  body text NOT NULL,                        -- C3; author-locked edit window 5min
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency-Key persistence: replays return the original result.
CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  user_id text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
