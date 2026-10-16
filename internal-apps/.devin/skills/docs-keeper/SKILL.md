---
name: docs-keeper
description: Enforce the docs contract on every PR — docs stay true to code. Use when authoring or reviewing any PR in this repo.
---
1. Behavior-changing PR → the matching doc section updated in the SAME PR
   (docs-lint enforces; docs-unchanged label requires written
   justification in the PR body).
2. Schema truth = db/migrations only; LLD schema is commentary. A
   migration without its LLD update fails schema-drift — fix the LLD,
   never weaken the gate.
   Same law for OpenAPI ↔ LLD endpoint drift.
3. New architectural decision → new ADR per the standing ADR playbook
   (rejected alternative's cost is mandatory content). A PR contradicting
   an existing ADR → STOP, propose an amendment instead of building
   around it.
4. OPEN-QUESTIONS entries need owner + trigger + review date. No fork
   without all three; expired dates surface in the weekly keeper run.
5. Every Tier-1 app's RUNBOOK answers deploy / rollback / rotate-secrets
   / restore-from-PITR / top incident plays — sessions touching any of
   these update the runbook in the same PR.
6. Never regenerate or "clean up" migrations, audit rows, or ADRs —
   immutability is the contract.
