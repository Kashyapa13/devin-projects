# ADR-0006 — FastLane audit: same-transaction append-only writes

Status: accepted · Immutable once merged; amend by new ADR.

## Context

AML-adjacent records: every mutation must have its audit row, 100%, no
exceptions — "decisions audited 100%" is a PR promise. Retention 5 yr.

## Options

- **(A) `auditWriter(tx, event)` in the SAME transaction as the state
  change** — the decision and its record commit together or roll back
  together; kill-test proves no orphan state.
- **(B) Async audit (queue/outbox consumer)** — crash between commit and
  consume = unaudited decision; eventual consistency is the wrong word
  for a regulatory record: the gap is unaudited time, not delay.
- **(C) App-level logging only** — logs are debuggability, not evidence;
  mutable, sampled, unverifiable.

## Decision

A — platform-audit `auditWriter` inside the mutation's transaction;
`audit_events` is append-only (REVOKE UPDATE/DELETE); SIEM export daily.

## Tradeoffs

Writes serialize through the mutation tx (slightly higher write latency)
— accepted; the alternative trades a measurable latency for an
unmeasurable compliance hole.

## Consequences

- `fastlane_audit_write_fail_total > 0` = PAGE NOW (AGENTS.md §6).
- Reveal-before-return kill-test is a CI gate (§7).
- Export path: `audited()` + SIEM JSON-lines — tested, not assumed.
