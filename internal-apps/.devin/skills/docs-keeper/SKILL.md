---
name: docs-keeper
description: Docs-contract upkeep — keep HLD/LLD/OPEN-QUESTIONS/RUNBOOK and ADRs in sync with code.
---

# docs-keeper

The docs contract is non-negotiable (root AGENTS.md). Behavior-changing PRs
update the matching doc section in the SAME PR.

## Checks

- LLD schema sections stay commentary-only; drift vs `db/migrations` fails
  CI (schema-drift).
- `OPEN-QUESTIONS.md` entries carry owner, trigger, review date; sweep
  stale ones.
- `RUNBOOK.md` updated by any session touching deploy/rollback/secrets/
  restore/incidents.
- Architectural diffs without a new ADR → block, per adr-check.
