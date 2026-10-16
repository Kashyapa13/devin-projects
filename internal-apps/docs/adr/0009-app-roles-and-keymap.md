# ADR-0009 — App-role additions to platform surfaces (reviewer, supervisor, reject key)

Status: accepted · Immutable once merged; amend by new ADR.

## Context

FastLane's constitution (§4/§5) names `reviewer` and `supervisor` roles —
the platform `rolesMatrix` only shipped admin/operator/analyst/viewer, `useKeyboardNav`'s `QueueKeys` lacked the actions FastLane's anchor
surface binds (`reject`, `note`, `escalate`, `open`, `back`, later `doc`), and
`QueueTable` couldn't mark the keyboard-cursor row. Instantiating the
first real app surfaced both gaps.

## Options

- **(A) Extend the platform surfaces** — add `reviewer`/`supervisor` rows
  to `rolesMatrix` (additive keys; existing roles unchanged); add optional
  `reject`/`note`/`escalate`/`open`/`back`/`doc` handlers to `QueueKeys`
  (`defaultKeyMap` unchanged — apps pass a custom `keyMap`); add
  `selectedId` to `QueueTable` (aria-current + data-selected on the row).
- **(B) Per-app role/parallel matrices** — each app redefines roles;
  the matrix stops being "the program's" and drift between apps becomes
  invisible. Rejected: the cost is review-onboarding per app plus
  divergent RBAC vocabularies.
- **(C) Map fastlane roles onto existing names** — `operator`≈reviewer,
  `admin`-subset≈supervisor: breaks the LLD matrix's named roles and
  grants `admin` to supervisors. Rejected: wrong permissions reach the
  highest-trust surface.

## Decision

A — additive platform change, documented here (the docs contract's
platform-change ADR requirement).

## Tradeoffs

Platform surface grows per app vocabulary — accepted; the alternative is
app-local RBAC, which the dependency law exists to prevent.

## Consequences

- `Role` union now includes `reviewer`/`supervisor`; no existing role's
  permissions change.
- Apps bind any of the optional keys via a custom `keyMap`
  (e.g. `{...defaultKeyMap, r:"reject", n:"note", e:"escalate", d:"doc"}`).
- `QueueTable`'s `selectedId` gives keyboard nav a visible + announced
  cursor row (aria-current) without forking the component.
- New app-specific roles ride future ADRs on this pattern.
