# ADR-0018 — Decision engine as a new app (SHADOW rung only)

Status: **approved — strategy writer: Vaibhav** (merged via PR #9)

## Context

FastLane's KYC queue is in human operation: reviewers claim and decide
(PENDING → IN_REVIEW → APPROVED/REJECTED/ESCALATED — five legal
transitions, every one audited). The program wants a decision engine
that can eventually shoulder the low-risk band — but an engine that
DECIDES is a different class of component than an engine that renders.
The spec's own law gates this: **no named strategy writer + no approved
ADR = no engine code.**

## Options

- **A. Module inside FastLane** — decide inside the app that owns the
  queue. Rejected: violates the per-app isolation law (one DB, one
  pipeline, one rollback per app); a strategy regression would ship
  inside the regulated app's deploy blast radius; no independent
  kill-switch boundary.
- **B. Power Automate / Power Apps lane** — off-repo flow rules.
  Rejected: same unversioned-rules problem the program is leaving;
  thresholds live in a vendor UI with no PR review, no CI golden set.
- **C. ML-first scoring service** — model decides directly. Rejected
  for now: unauditable confidence, no explainable reason code; AML
  audit needs "why" per decision. ML scores slot in *later* as inputs
  (`ml_scores[]`), never as the decider.
- **D. New app, deterministic strategy packs (chosen)** — own
  deployment unit, own `decision_db`, own pipeline; rule evaluation
  over a versioned signal contract; SHADOW rung first.

## Decision

`apps/decision-engine/` — a NEW APP (own OCI image, own `decision_db`,
own pipeline, own rollback — repo law). API-only integration with
FastLane is authorized **by this ADR** (the cross-app-call exception
the constitution requires).

- **case_signals v1 contract**: `risk_score`, `doc_verification`,
  `country_tier`, `watchlist_hits`, `tenure_days`, `velocity`, plus
  extensible `ml_scores: [{model_name, model_version, score,
  score_type}]` — real ML scores arrive later without rearchitecting.
- **ModelScoreProvider interface**: `MockModelScoreProvider`
  (deterministic, clearly-labeled placeholder values from seed) now;
  a real scoring service behind the same interface later.
- **Deterministic core**: decisions come from versioned strategy
  packs — explainable, reproducible, no black box. LLM may only be
  upstream, extracting structured signals from documents.
- **Seed packs, DECLARED precedence** (first match wins; fired pack +
  rule recorded on every decision): `high-risk-escalate` >
  `doc-anomaly-review` / `velocity-anomaly-review` >
  `low-risk-approve-candidate` > `default-to-human` (the catch-all is
  a strategy, never an accident).
- **Rung ladder, promotion = measured data + ADR (never this
  session)**: SHADOW now (engine decides nothing in reality; ≥4 weeks
  of agreement-vs-human data before eligibility) → ASSIST
  (pre-decision + reasons, one-key confirm/override with per-rule
  telemetry) → AUTO (high-confidence/low-risk band only; auto-reject
  requires its own ADR).
- **Guardrails (non-negotiable)**: one-click kill switch → all cases
  to humans, in-flight auto-decisions frozen for supervisor review ·
  wrong-rate budget: QA samples 5% of auto-decisions, overturn >2%
  narrows the auto-band automatically, >5% drops a rung · daily
  report (decisions by band, confidence distribution, disagreements) ·
  every decision row = inputs + pack version + fired rule +
  confidence + reason code, in `decision_db` AND mirrored to
  FastLane's `audit_events` via the integration contract.
- **Governance**: threshold changes = PR + strategy-writer review;
  pack changes = ADR; pack stale >90 days → stale-pack alert +
  (future) auto-band narrows.

## The honest cost

- Auto-decisions carry a **strategy version into the AML audit
  trail** — a reviewer decision is attributable to a person; an engine
  decision is attributable to a code revision. Regulators must accept
  pack-version + fired-rule + inputs as the "who/why" — that is a
  compliance conversation, not a code one.
- A second app = second DB, pipeline, runbook, on-call. The engine is
  only as good as the humans actively writing its strategies; without
  a named owner it decays silently — hence the hard gate.

## Consequences

- This ADR authorizes: the ADR itself, DECISION-ENGINE-GAP.md, and the
  owner request. It does **not** authorize engine code: that needs the
  named strategy writer recorded here + this ADR approved.
- Approval path: promote SHADOW→ASSIST→AUTO only via future ADRs
  carrying measured wrong-rate data.
- `docs/DECISION-ENGINE-GAP.md` holds the PHASE A discovery the build
  phase starts from.
