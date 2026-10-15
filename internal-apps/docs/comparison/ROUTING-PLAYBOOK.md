# ROUTING-PLAYBOOK — where each build goes

Companion to [ADR-0001](../adr/0001-three-lane-routing.md) (decision C:
three lanes). This is the operating procedure: the PR Intake Gate, the
door map, the walk-out decisions, and the pre-committed falsifiers.

## The PR Intake Gate (D2 — routing procedure)

Every request for an internal tool enters as a press release — one page:
customer, problem, promised outcome, acceptance test. The gate scores the
request on the three §5 tie-breakers, then assigns a lane and an owner:

1. **Data class + user count.** C4 or engineering-grade guarantees
   required → Devin lane. Forms/approvals on M365 data → Power Apps.
   Scheduled reporting → Power BI. Commodity → buy, never build.
2. **Seat math.** Apply the §2 cost formula at the real user count.
3. **Lane capacity this quarter.** Who can take it within the SLA.

Output: lane + owner + the promise that becomes a quarterly KPI
(KPI-DASHBOARD.md). A routing that can't name its promise doesn't ship.

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
  shows Premium spend growth → migrate flags to the Devin-built exit
  design (§3.4), accepting SDK + 99.95%-SLA ownership as the cost.
- ACU/app runs >3× estimate for a quarter → renegotiate the order form or
  cap the Devin lane's intake.
