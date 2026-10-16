# ADR-0005 — FastLane state machine: app-layer table-driven + DB backstop

Status: accepted · Immutable once merged; amend by new ADR.

## Context

KYC case status has exactly five legal transitions (AGENTS.md §4):
PENDING→IN_REVIEW, IN_REVIEW→APPROVED, IN_REVIEW→REJECTED,
IN_REVIEW→ESCALATED, ESCALATED→IN_REVIEW (supervisor reopen). Every edge
carries a guard and a role; every illegal attempt is counted and rejected.

## Options

- **(A) App-layer pure module, table-driven from `state_transitions` +
  DB CHECK as backstop** — guards unit-testable as data (full matrix,
  both directions, every invalid edge), roles live in the allow-table.
- **(B) DB triggers alone** — enforcement invisible to unit tests; the
  trigger is correct in exactly one place (the DB), unmigratable and
  untestable outside integration; a silent edge added via DDL bypasses
  the ADR gate that protects the matrix.
- **(C) Service code as scattered conditionals** — the guard that
  protects "reject needs ≥20-char reason" ends up copy-pasted; the first
  missed site is a compliance hole.

## Decision

A — `api/statemachine/` is a pure table-driven module; API applies the
verdict; `status CHECK` + allow-table are the backstop, not the source.

## Tradeoffs

Two places carry the rule (module + CHECK) — accepted; drift between
them fails the same transition-matrix test that protects both.

## Consequences

- Adding/removing an edge = ADR + LLD update + full matrix re-test
  (AGENTS.md §4 — the contract, not a convention).
- `state_transitions` rows are data: seeded, versioned, auditable.
