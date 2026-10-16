# ADR-0008 — FastLane historical cases: link-out strangler, not migration

Status: accepted · Immutable once merged; amend by new ADR.

## Context

Historical KYC cases live in the legacy Dataverse app. FastLane needs
reviewers to see history; moving the records touches a regulated
chain-of-custody. D6 pre-commits: no cutover today; the strangler
trigger = license audit shows Premium growth OR FastLane shows SLA-miss
reduction the old app can't match.

## Options

- **(A) Link-out strangler** — history stays read-only in Dataverse;
  new decisions live in FastLane; the cutover decision is deferred to a
  trigger, not a date.
- **(B) Migrate history now** — audit chain-of-custody risk across two
  systems during the move, for zero user-visible benefit: reviewers see
  the same history either way. The cost is a regulated-records risk
  bought for nothing.
- **(C) Keep reviewers in the old app for history** — splits the
  workflow the −40% promise depends on; queue clear-time loses the
  single-pane the demo sells.

## Decision

A — read-only link-out; strangler trigger per D6 (documented, not dated).

## Tradeoffs

Two systems stay in scope until the trigger fires — ops overhead
accepted as the price of a reversible regulated decision (a two-way
door kept two-way).

## Consequences

- The D6 trigger is a falsifier-class pre-commitment (ROUTING-PLAYBOOK).
- When/if it fires: migration playbook is data-migration/SKILL.md —
  dormant until this ADR is amended.
- OPEN-2 tracks the link-vs-strangler fork (owner: platform PAIR).
