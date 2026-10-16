# DECISION-ENGINE-GAP — PHASE A discovery (2026-10-15)

Discovery on the live FastLane queue before any engine build. Per the
spec's hard gate this doc + ADR-0015 + a named strategy writer precede
all code.

## 1. What exists today (mapped)

**Queue data model** (`apps/fastlane/db/migrations/0001_init.up.sql`):
`kyc_cases` — `id`, `customer_ref`, `country` (char2), `risk_score`
(0–100), `status`, `assignee_id`, `sla_due_at`, `legal_name_enc` (C4
fieldCipher), `version`, timestamps.

**Decision flow** (`api/src/statemachine.ts` — five legal transitions):
PENDING→IN_REVIEW (claim, assigns) · IN_REVIEW→APPROVED ·
IN_REVIEW→REJECTED (needsReason) · IN_REVIEW→ESCALATED ·
ESCALATED→IN_REVIEW (supervisor reopen). Every transition write-ahead
audits to `audit_events` in the same transaction.

**Audit infrastructure**: `audit_events` (append-only, SIEM export) —
the engine mirror target already exists; no new table needed on the
FastLane side.

**Volumes/history**: 10k seeded synthetic cases locally; **no real
≥4-week ops history exists** → the golden set falls to the spec's
fallback path: strategy writers craft + adjudicate a synthetic 200+
case set (real distributions unavailable until production history
accrues — TUNE-ME thresholds therefore ship as placeholders calibrated
later from the app's own shadow history, exactly as the spec intends).

## 2. Signals available vs needed (case_signals v1)

| signal | status | source / gap |
|---|---|---|
| `risk_score` | **have** | `kyc_cases.risk_score` |
| `doc_verification` | **gap** | not in schema — needs a signal producer (doc panel records issuance, not verdicts) or MockModelScoreProvider placeholder |
| `country_tier` | **derivable** | `kyc_cases.country` exists; tier mapping is a strategy-pack lookup table, not schema |
| `watchlist_hits` | **gap** | no screening source in the stack — MockModelScoreProvider placeholder |
| `tenure_days` | **gap** | no customer-tenure field — placeholder |
| `velocity` features | **gap** | no event stream — placeholder |
| `ml_scores[]` | contract only | `{model_name, model_version, score, score_type}` — real ML later |

Gap verdict: only `risk_score` is real today — exactly why
`ModelScoreProvider` exists: MockModelScoreProvider supplies the rest
as labeled placeholders until producers land.

## 3. Rung ladder mapped to existing statuses

- SHADOW: engine reads signals, writes would-be decisions to
  `decision_db` only — FastLane statuses untouched.
- ASSIST: pre-decision + reasons attach to a case (new read-side
  surface on `/cases/[id]`); human still drives all five transitions;
  override telemetry per rule.
- AUTO: `low-risk-approve-candidate` band executes IN_REVIEW→APPROVED
  via the existing transition (assigned to the engine service
  principal, supervisor-bypass audited as engine actor); all else
  routes human with assist attached. No auto-reject — separate ADR.

## 4. Audit integration plan

Engine decision rows (inputs + pack version + fired rule + confidence
+ reason code) live in `decision_db`; ASSIST/AUTO actions that touch a
case mirror to FastLane `audit_events` via the API-only integration
ADR-0015 authorizes — same write-ahead shape (`actor` = engine
principal, `action` = `case.engine_decision`).

## 5. Open items before build

- **Named strategy writer** — required owner, blocks everything.
- ADR-0015 approval.
- Golden set: synthetic adjudicated 200+ by the strategy writers
  (fallback path — no real history yet).
