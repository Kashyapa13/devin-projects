# FastLane — AGENTS.md (app constitution)

Tier-1 regulated app. SLO: 99.9% · RTO 1h · RPO 15min · on-call rotation.
Docs truth: docs/HLD.md, docs/LLD.md, docs/RUNBOOK.md, docs/adr/.
Schema truth: db/migrations ONLY. LLD schema section is regenerated commentary.

## 1. Stack (fixed — changes require ADR)
- Runtime: Node 22 LTS, TypeScript 5.x strict, ESM.
- API: Fastify + TypeBox (request/response validation compiled from schema).
- ORM: Drizzle (SQL-transparent; migrations authored as .sql, never generated
  silently). Postgres 16, RDS Multi-AZ, PITR.
- Frontend: React 19 + Vite PWA, Tailwind, platform/ui kit, TanStack Query,
  i18next (ALL strings externalized — hard gate).
- Tests: Vitest (unit) · Testcontainers-Postgres (integration) · Playwright
  (e2e, keyboard-only mode) · k6 (perf) · axe-core (a11y in Playwright).
- Client never talks to DB. API never proxies document bytes.

## 2. Directory law
  apps/fastlane/{api/{routes,services,statemachine,db},
    web/{pages,components,keys}, db/migrations, docs, scripts/seed.ts}
Route files ≤150 lines, services hold logic, statemachine/ is a pure module
(no I/O) — table-driven from state_transitions.

## 3. Data classification (field-level — violations are security incidents)
| Field | Class | Handling |
|---|---|---|
| customer_ref | C3 | plaintext, logged ok |
| legal_name | C4 | app-layer AES-256-GCM, envelope KMS key, 90-day rotation; never plaintext at rest, never in logs/telemetry/recordings/prompts; masked by default in UI — reveal is an audited action |
| doc objects | C4 | S3 + signed URLs 15min; bytes never transit the API |
| case_notes.body | C3 | plaintext; author-locked edit window 5min |
| audit_events | C2 | append-only; 5yr retention; SIEM export daily |
Fixtures: scripts/seed.ts with fixed seed "kyc-seed-v1" ONLY. Real PII in any
non-prod environment = incident, report immediately, purge, disclose.

## 4. State machine (complete — the ONLY legal transitions)
PENDING→IN_REVIEW      guard: assignee=self (claim)         roles: reviewer+
IN_REVIEW→APPROVED     guard: reviewer is assignee          roles: reviewer+
IN_REVIEW→REJECTED     guard: assignee; reason≥20 chars     roles: reviewer+
IN_REVIEW→ESCALATED    guard: assignee                      roles: reviewer+
ESCALATED→IN_REVIEW    guard: supervisor claims (via /claim)  roles: supervisor
Any other edge: 400, logged via fastlane_transition_total{ok=no} (counter).
Guards run in statemachine/ pure module; API applies; DB CHECK is backstop.
Adding/removing an edge = ADR + LLD update + full transition-matrix re-test.

## 5. API law
- Prefix /api/v1. Cursor pagination ONLY (queues mutate; offset = race).
- Error envelope: {error:{code,message,detail?,req_id}} — code from registry
  in api/errors.ts; message follows UI-copy rules (what happened + what to do).
- Mutations: Idempotency-Key header required; replays return original result.
- X-Request-ID in → out on every log line and audit row.
- Rate limits: auth 5/min/IP; mutations 60/min/user; queue GET 300/min/user.
- Endpoints (registry in LLD's API section): /queue /cases/:id /claim /approve
  /reject /escalate /note /reveal /audit /doc-url /cron/sla-digest. New
  endpoint = LLD row + contract test first.
- PII reveal: POST /cases/:id/reveal unmasks for that session and writes
  the audit row BEFORE the value is returned. UI-unmask without an audit
  row = P1 incident.

## 6. Observability (exact names — dashboards/alerts are wired to these)
Metrics: fastlane_queue_load_ms (h, labels: tab) · fastlane_transition_total
(c, labels: from,to,ok) · fastlane_cases_active (g, status) ·
fastlane_sla_breach_count (g) · fastlane_audit_write_fail_total (c) ·
fastlane_keystroke_decision_ms (h) · fastlane_pii_reveal_total (c).
Alerts (PagerDuty): audit_write_fail_total > 0 = PAGE NOW (regulatory).
queue_load_ms p95 > 1000ms for 10m = page. sla_breach growth > 20%/h = page.
p95 > 300ms for 30m = ticket. Log fields (JSON): ts,level,req_id,actor_id,
case_id,action,ms,outcome. Banned from logs: legal_name, doc contents,
assignee PII. Never sample audit-adjacent logs.

## 7. Testing gates (CI blocking, in this order)
1. lint+typecheck 2. unit: statemachine full matrix (both directions of every
edge + every invalid edge), guard logic, reason-rule 3. integration (ephemeral
PG): routes+RBAC matrix (3 roles × every endpoint), audit atomicity (kill tx
mid-action → no orphan state), PII reveal writes its audit row before
returning the value (kill-test), cursor stability 4. contract: OpenAPI vs LLD
diff 5. e2e (Playwright, keyboard-only): claim→reject-no-reason(400 shown
with actionable message)→reject-ok→audit visible→queue removal; recording
attached to release PR 6. axe: zero critical 7. k6: 10k active cases,
50 VU, 5m soak — queue p95 < 1000ms, error rate < 0.1%. Perf regression =
build fails, no override without VP-tagged exemption.
Coverage: statemachine/ and services/ ≥ 90% branches; routes ≥ 80%.

## 8. Deploy & rollback
Env matrix dev→staging→prod, each with own vault scope. Migrations:
expand-contract; additive first, destructive in a later release; down.sql
tested in CI. Blue/green: auto-rollback if error rate > 2% (5m) or
queue_load p95 > 1200ms (10m). Env vars (values in vault, never in repo):
DATABASE_URL, KMS_KEY_ARN, DOC_BUCKET, S3_SIGNER_KMS, SLACK_DIGEST_URL,
SSO_ISSUER, SESSION_TTL=8h. Health: /healthz (liveness, no deps) vs
/readyz (DB+KMS probe). Capacity envelope [EST]: 60 concurrent analysts,
30 RPS peak, 50k active cases — revisit at 5x.

## 9. Devin session protocol (this file is your contract)
START: read root AGENTS.md → this file (already in your context) →
docs/HLD.md → docs/LLD.md → docs/OPEN-QUESTIONS.md. Then plan; surface
conflicts, never resolve silently.
STOP-CONDITIONS (halt, ask): request implies PII in non-prod, new state
transition, new endpoint, schema change, doc/code conflict, anything
touching platform/.
EVERY PR: code + tests + doc-section update + (if architectural) new ADR +
CI green incl. drift gates. PR description links the PR-promise it serves.
FORBIDDEN: generated migrations without review of raw SQL; COUNT(*) on queue
load path; proxying doc bytes; client-side-only validation of the reason
rule; new deps without ADR; logging banned fields; "temporary" audit bypass.
