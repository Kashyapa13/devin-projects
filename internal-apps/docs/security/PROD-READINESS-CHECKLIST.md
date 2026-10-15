# Production readiness checklist

## Door map — slow (VP) vs fast (teams)

**One-way (VP, deliberately):** KYC cutover (regulated records) · scaffold
standards (change = portfolio rewrite) · enterprise contracts (annual
lock-in) · compliance architecture.

**Two-way (teams, fast):** per-app routing (rebuild on another lane = 1–2
wks) · RefundLens fork · flags stay-put decision (two-way door: replica +
trigger define the reverse path — no vendor in scope) · pilot scope.

## Walk-out decisions (the VP meeting)

- **D1** Reframe pilot: build FastLane + RefundLens to their press releases
  as acceptance criteria; flags → stays on Power Apps — the pilot's Devin
  replica is the capability comparison — APPROVE NOW.
- **D2** Adopt the PR Intake Gate as routing procedure — APPROVE NOW.
- **D3** License audit: named owner, 5 business days — ASSIGN NOW (gates D6).
- **D4** Pre-commit review-turnaround gate: >48h sustained → Devin lane
  scales down to consoles-only — APPROVE NOW (safety valve).
- **D5** Budget: pilot ≈ $25–40k [EST]; steady-state envelope
  $210–340k/yr contingent on telemetry; exit reserve on paper —
  APPROVE PILOT NOW.
- **D6** KYC: no cutover decision today; strangler trigger = license audit
  shows Premium growth OR FastLane shows SLA-miss reduction the old app
  can't match — DEFER WITH TRIGGER.
- **D7** Name lane owners in the room: PA → analyst lead; Devin → platform
  PAIR (bus-factor fix, day one); PBI → data lead; Buy → procurement —
  ASSIGN NOW.

## Falsifiers (pre-committed — evidence that reverses the recommendation)

- Pilot review turnaround sustains >48h → Devin lane shrinks to
  consoles-only; queues re-route to Power Apps despite the UX tilt.
- License audit shows Premium sunk AND incoming PRs skew forms-heavy →
  PA-primary; Devin stays pure engineering productivity.
- RefundLens usage logs: filters used, ask-box ignored → kill the
  conversational build; reporting consolidates in Power BI.
- Flags trigger fires — the pilot replica demonstrates a clear
  capability/run-cost advantage over the PA panel AND the license audit
  shows Premium spend growth → migrate flags to the Devin-built exit design
  (§3.4), accepting SDK + 99.95%-SLA ownership as the cost.
- ACU/app runs >3× estimate for a quarter → renegotiate the order form or
  cap the Devin lane's intake.

## KPI dashboard (PR promises become quarterly KPIs)

Queue clear-time −40% vs baseline · FastLane queue p95 <1s · FastLane
decisions audited 100% · median time-to-answer <60s · flag flips with
complete attribution 100% (replica demo metric — production flags remain on
Power Apps) · PR-approved→live <3 weeks · engineering capacity on internal
tools <1.5% · cost per shipped app trending down after scaffold
amortization · CRUD-class app from template <1 day (full PR-to-live <3
weeks) · senior review turnaround <48h (the D4 gate) · PR-promise-kept rate
>90% (promises passing acceptance tests at launch — the Amazon metric: did
we ship what we wrote down, or what was convenient?).

## Production readiness checklist (per app — the ship gate)

- **SECURITY:** SSO + server-side RBAC verified incl. object-level ·
  threat-model top-5 · CSP/HSTS/CSRF/rate-limit verified · dep+container
  scan clean · C4 encrypted, secrets in vault · pen-test (Tier-1) or
  security review.
- **AUDIT:** audit_events on all mutations, write-ahead, export tested ·
  Tier-1 5-yr retention per counsel.
- **TESTING:** unit ≥80% logic (≥90% branches on statemachine/services per
  constitution); integration; contract; e2e recording attached · migration
  rollback tested; synthetic seed only · acceptance proven by EXECUTED
  commands with outputs recorded — code-reading assertions are not
  acceptance.
- **RELIABILITY:** probes, RED dashboard, alerts wired · Tier-1 load passed;
  degradation demonstrated · PITR restore drill done.
- **DEPLOY:** CI scan→test→approval→protected-env · blue/green or rollback
  verified.
- **DOCS/ACCESS:** README+runbook+CHANGELOG · WCAG automated passing · tour
  recorded.
- **GOVERNANCE:** data class assigned; DLP prompt-scan passing · owner
  on-call assigned; SLA tier + error budget published.
