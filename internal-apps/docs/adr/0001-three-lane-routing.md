# ADR-0001 — Three-lane routing for internal tools

Status: accepted · Immutable once merged; amend by new ADR.

## Context

The internal tools program needs a build-lane model: which platform builds
which class of app, and who owns each lane.

## Options

- **(A) Power Apps-primary** — analyst-maintainable, but ops queues hit
  delegation limits + premium-connector costs, consoles frustrate engineers.
- **(B) Devin-primary** — one build plane, but review capacity becomes the
  currency for every app incl. low-value forms; 60-eng review slack unproven.
- **(C) Three-way routing** — PA for forms (rides sunk M365, ~zero eng),
  Devin for queues/consoles (its unbeaten turf), Power BI for reporting,
  buy for commodities.
- **(D) Defer.**

## Decision

**C**, operationalized by the PR Intake Gate (Part 5), with pre-committed
falsifiers (Part 7). Hybrid tax ≈0.25–0.5 FTE [EST] accepted BECAUSE the PA
lane consumes zero engineering capacity and the Devin lane is gated on
measured review turnaround (<48h, falsifier #1).

## Tradeoffs

Two governance surfaces instead of one; routing discipline must be enforced
at intake or lanes blur.

## Consequences

- Routing is delegable.
- KYC cutover deferred behind the pre-committed strangler triggers (Part 7).
- Every net-new app gets a half-day PR/FAQ before lane assignment.
