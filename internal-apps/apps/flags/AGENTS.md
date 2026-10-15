# flags — AGENTS.md (§3.4)

Procurement artifact — **NO build, NO deploy**. Production flags stay on
Power Apps per ADR-0002.

## What lives here

- `docs/stay-decision.md` — record of the stay-put decision (ADR-0002).
- `docs/demo-spec.md` — the pilot's Devin replica spec: CRUD + env scoping +
  audit + RBAC + runtime eval API, built purely as the capability
  demonstration against the PA original.
- `docs/exit-design.md` — **DORMANT** Devin-built exit design; activates
  only if the flags trigger fires (replica shows clear capability/run-cost
  advantage AND license audit shows Premium spend growth — both, not
  either), via ADR amendment.
- `shim/SPEC.md` — spec for the read-path shim, if ever needed.
- `scripts/export.ts` — export tooling stub.

## Stop-conditions

Do not add build/deploy config here · do not scope a fourth vendor (ADR-0002
context) · the honest ownership cost is on record: whoever owns a flag
system owns SDK versioning + a 99.95% runtime SLA + on-call.
