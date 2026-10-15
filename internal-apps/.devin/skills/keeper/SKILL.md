---
name: keeper
description: Weekly dep-bump PR and monthly staging PITR drill (companion to .github/workflows/keeper.yml).
---

# keeper

- **Weekly:** bump workspace deps, run affected tests, open a dep-bump PR.
- **Monthly:** staging PITR restore drill per app; record results in the
  app's `RUNBOOK.md` (restore drill is a ship-gate item).
- Roll up outcomes into `docs/comparison/PILOT-TELEMETRY.md`.
