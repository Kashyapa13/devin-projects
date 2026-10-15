# ADR-0002 — Flag admin panel stays on Power Apps

Status: accepted · Immutable once merged; amend by new ADR.

## Context

The flag admin panel works and is governed on Power Apps. This engagement's
question is Devin vs Power Apps — introducing a fourth vendor is out of
scope for the evaluation. The working-backwards PR revealed the app's hidden
promise: SDKs for ~60 services + a ≥99.9% read-API SLA — a runtime product;
that ownership cost is the reason NOT to move it today, whichever platform
would own it.

## Options

- **(A) Migrate flags to a Devin-built app now** — incurs SDK-versioning +
  99.95%-runtime-SLA + on-call ownership immediately.
- **(B) Stay on Power Apps; build a Devin replica as capability demo** —
  no migration, comparison evidence from the pilot.
- **(C) Vendor bake-off** — out of scope for this engagement.

## Decision

Production continues on Power Apps — **no migration, no vendor bake-off**
(option B). The pilot builds a Devin replica of the panel (CRUD + env
scoping + audit + RBAC + runtime eval API) purely as the capability
demonstration against the PA original. Any future migration is Devin-built
on the scaffold, gated behind the flags trigger (pilot replica demonstrates
a clear capability/run-cost advantage AND the license audit shows Premium
spend growth — both, not either), via an ADR amendment.

## Tradeoffs

Honest cost kept on record: whoever owns a flag system owns SDK versioning +
a 99.95% runtime SLA + on-call — that bar is the trigger-gate, not a reason
to go shopping elsewhere.

## Consequences

- `apps/flags` = stay-decision record + capability-demo spec + dormant
  Devin-built exit design.
- No vendor evaluation artifacts.
