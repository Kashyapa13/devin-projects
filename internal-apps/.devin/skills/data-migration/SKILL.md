---
name: data-migration
description: Executes an approved migration decision (flags trigger, KYC strangler). Refuse to run unless the ADR amendment exists — this skill is dormant by design.
---
GATE ZERO: verify the OPEN-QUESTIONS trigger has FIRED and the ADR
amendment is merged. No amendment → refuse, regardless of who asks.
1. Strangler law: new work forwards to the new system; history stays
   read-only where it was created. NEVER migrate regulated records —
   KYC history staying in Dataverse for its retention period is the
   design, not a workaround.
2. Reference-data export via platform-db: idempotent, reconciliation
   counts before/after, diff report attached to the ADR.
3. Dual-read where the design has a shim: shim is the only integration
   point; rollback = shim config, never a deploy.
4. Waves ≤ 10 repos, one PR each, every PR carrying its contract test;
   divergence monitoring for the full window; page + halt on any
   divergence.
5. Day-30 retirement of the old surface; chain-of-custody memo for
   auditors: what moved, what stayed, why, when, who approved.
STOP: no ADR amendment · any request to migrate KYC history (absolute) ·
unresolved divergence.
