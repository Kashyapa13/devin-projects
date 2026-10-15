# FastLane — LLD

## Core DDL (commentary — schema truth lives in db/migrations)

```sql
CREATE TABLE kyc_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_ref text NOT NULL,
  legal_name_enc bytea,                    -- C4: app-layer encrypted
  country char(2) NOT NULL,
  risk_score smallint CHECK (risk_score BETWEEN 0 AND 100),
  doc_type text NOT NULL,
  status text NOT NULL CHECK (status IN
    ('PENDING','IN_REVIEW','APPROVED','REJECTED','ESCALATED')),
  priority text NOT NULL DEFAULT 'MED',
  assignee_id uuid REFERENCES users(id),
  sla_due_at timestamptz NOT NULL,
  version int NOT NULL DEFAULT 1,          -- optimistic locking
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_active ON kyc_cases (status, sla_due_at)
  WHERE status NOT IN ('APPROVED','REJECTED');
CREATE INDEX queue_mine ON kyc_cases (assignee_id, status) WHERE status='IN_REVIEW';

-- users + case_notes tables: defined in migration 0002 per the §3.2 field rules
CREATE TABLE state_transitions (from_status text, to_status text, roles text[]);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY, entity text, entity_id uuid,
  actor_id uuid NOT NULL, action text NOT NULL, diff jsonb, req_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);  REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;  -- append-only, enforced
```

## API registry

GET /queue?tab=mine|team|breaching + filters (partial indexes) · GET /cases/:id
· POST claim|approve|reject|escalate|note|reveal (reveal = audited unmask —
masked by default; allow-table validation; reject requires reason → 400;
optimistic lock on version) · GET /cases/:id/audit + GET /audit (exportable)
· GET doc-url (signed, never bytes) · POST /cron/sla-digest.

RBAC: reviewer (claim, act on own) · supervisor (+ reopen ESCALATED, team
views) · admin (config) — server-side only.

## Deployment

dev (ephemeral seed) → staging (synthetic full-volume, pen-tested) → prod
(own VPC, WAF, IP-allowlisted); blue/green; auto-rollback error >2% 5min or
queue p95 >1200ms 10min; migrations expand-contract with tested down.sql;
99.9% / RTO 1h / RPO 15min; monthly staging restore drill (via KEEPER).

## Usage KPIs (= the PR promises)

−40% clear time · queue p95 <1s · 100% decisions audited · PII reveals
audited 100% · DAU/assigned analysts · SLA-breach count ·
keystroke-to-decision latency.
