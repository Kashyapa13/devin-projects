# flags — stay decision (ADR-0002)

Production flag admin panel **stays on Power Apps** — production continues
on the existing PA panel. No migration, no vendor bake-off; this engagement
reasons Devin vs Power Apps only — no third-party vendor is in scope.

## Rationale (ADR-0002)

The PA panel is not broken enough to justify a change: it already delivers
CRUD, env scoping, and an adequate audit surface for the flags team's real
volume. The capability demo exists to *price* the alternative, not to
justify it.

## The hidden-promise cost — the trigger-gate on record

Whoever owns a flag system owns, permanently:

- **SDKs for ~60 services** — versioning, back-compat, per-language drift
  across every consumer
- **a 99.95% runtime SLA** — the eval API is a runtime dependency of every
  service; its outage is everyone's outage
- **on-call** — pages, drills, escalation, forever

This cost — not the build cost — is the honest price of ownership, and it
is recorded here as the **trigger-gate** for ANY future move: a migration
proposal that does not price SDK versioning + the runtime SLA + on-call
into its run-cost is rejected unread.

## Exit (dormant)

Only if BOTH trigger conditions fire: (a) the demo replica shows a clear
capability/run-cost advantage over the PA panel, AND (b) the license audit
shows Premium spend growing with headcount. Then: ADR amendment first,
docs/exit-design.md activates, shim law governs.

Decision and reasoning: [ADR-0002](../../../docs/adr/0002-flags-stay-on-power-apps.md).
