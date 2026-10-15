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

CREATE TABLE users (id uuid PRIMARY KEY, email text UNIQUE NOT NULL,
  display_name text NOT NULL, roles text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE case_notes (id bigserial PRIMARY KEY, case_id uuid REFERENCES kyc_cases(id),
  author_id uuid REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE idempotency_keys (key text, actor text, response jsonb, status_code int,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (key, actor));

CREATE TABLE state_transitions (from_status text, to_status text, roles text[]);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY, entity text, entity_id uuid,
  actor_id uuid NOT NULL, action text NOT NULL, diff jsonb, req_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);  REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;  -- append-only, enforced
CREATE INDEX audit_entity ON audit_events (entity, entity_id);
```

## API registry

GET /queue?tab=mine|team|breaching + filters (partial indexes) · GET /cases/:id
· POST claim|approve|reject|escalate|note|reveal (reveal = audited unmask —
masked by default; allow-table validation; reject requires reason → 400;
optimistic lock on version) · GET /cases/:id/audit + GET /audit (exportable)
· GET doc-url (signed, never bytes) · POST /cron/sla-digest.

RBAC: reviewer (claim, act on own) · supervisor (+ reopen ESCALATED, team
views) · admin (config) — server-side only.

### RBAC matrix (server-side — platform-auth requireRole)

| Endpoint | reviewer | supervisor | admin |
|---|---|---|---|
| GET /queue | own + team tabs | all | all |
| GET /cases/:id | claimed/team | all | all |
| POST /claim | ✓ | ✓ | — |
| POST /approve · /reject | assignee only | supervisor reopen path | — |
| POST /escalate | assignee only | ✓ | — |
| ESCALATED→IN_REVIEW (supervisor reopen) | — | ✓ | — |
| POST /note | assignee | ✓ | — |
| POST /reveal | assignee (audited) | assignee (audited) | — |
| GET /cases/:id/audit · GET /audit | ✓ | ✓ | ✓ |
| GET /doc-url | assignee | ✓ | — |
| POST /cron/sla-digest | — | — | service |
| config | — | — | ✓ |

### Observability (§3.2 §6 — exact names)

Metrics: `fastlane_queue_load_ms` (h, tab) · `fastlane_transition_total`
(c, from,to,ok) · `fastlane_cases_active` (g, status) ·
`fastlane_sla_breach_count` (g) · `fastlane_audit_write_fail_total` (c) ·
`fastlane_keystroke_decision_ms` (h) · `fastlane_pii_reveal_total` (c).
Alerts: audit_write_fail >0 PAGE · queue_load p95 >1000ms/10m PAGE ·
sla_breach +20%/h PAGE · p95 >300ms/30m ticket. Log fields: ts, level,
req_id, actor_id, case_id, action, ms, outcome. Banned: legal_name, doc
contents, assignee PII.

### Testing gates (§3.2 §7)

lint+typecheck → statemachine full matrix → integration (ephemeral PG:
RBAC matrix 3 roles × every endpoint, audit kill-test, reveal-before-
return kill-test, cursor stability) → OpenAPI/LLD contract diff → e2e
keyboard-only (claim→reject-400→reject-ok→audit→removal) → axe zero
critical → k6 10k cases/50 VU/5m, queue p95 <1000ms, err <0.1%.
Coverage: statemachine+services ≥90% branches, routes ≥80%.

### Capacity envelope (§3.2 §8)

[EST] 60 concurrent analysts · 30 RPS peak · 50k active cases —
revisit at 5x.

## Feature Catalog

The anchor ships in this PR; every other entry is its own FB session —
one feature per session, copying the anchor's shape (schema → routes → UI
→ feature test in one PR).

| Entry | Status | Slice |
|---|---|---|
| Keyboard-day queue + decision panel | **anchor — this PR** | /queue (tabs, risk filter, badges/pills/chips, cursor) + /cases/[id] (c claim · a approve · r reject-with-reason · n note · e escalate) + audit timeline + audited masked-PII reveal · **motion notes (ADR-0014):** row→case shared-element morph on the ref cell · swipe-right approve / swipe-left opens reject / drag-to-claim drop strip (rubber-band, settle-back below threshold) · optimistic approve with spring rollback on error · focus glides on j/k · status-pill color-spring · SLA chip one-pulse on breach crossing · masked→reveal blur morph · press states scale 0.97 |
| Signed doc panel (doc-url expiry UX) | FB | /cases/[id] doc section |
| SLA breaching alert surfaces | FB | queue breaching tab + cron digest consumer |
| Notes timeline in queue row | FB | expandable row |
| Supervisor team dashboard | FB | /team view (supervisor role) |
| Audit export UI | FB | /audit page (supervisor/admin) |
| Case assignment re-route | FB | supervisor reassign action |
| Queue saved filters | FB | persisted filter sets |

## Deployment

dev (ephemeral seed) → staging (synthetic full-volume, pen-tested) → prod
(own VPC, WAF, IP-allowlisted); blue/green; auto-rollback error >2% 5min or
queue p95 >1200ms 10min; migrations expand-contract with tested down.sql;
99.9% / RTO 1h / RPO 15min; monthly staging restore drill (via KEEPER).

## Usage KPIs (= the PR promises)

−40% clear time · queue p95 <1s · 100% decisions audited · PII reveals
audited 100% · DAU/assigned analysts · SLA-breach count ·
keystroke-to-decision latency.
