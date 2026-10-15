---
name: app-building
description: Instantiate a new app from apps/_template and wire it into the fleet.
---

# app-building

New app = `cp -r apps/_template apps/<name>` — the template builds green
with zero edits (proven by template-smoke.yml).

## Steps

1. `cp -r apps/_template apps/<name>`; update the app's `AGENTS.md`
   (tier, data class, SLO, stop-conditions).
2. Author `docs/` (HLD, LLD, RUNBOOK, OPEN-QUESTIONS, THREAT-MODEL) —
   docs contract applies from the first PR.
3. Add env var NAMES to `.env.example` and `infra/ENVIRONMENTS.md`
   (names only — values in vault).
4. Register the app in the deploy matrix and CODEOWNERS.
5. Architectural choices → `docs/adr/NNNN-slug.md` per template.
