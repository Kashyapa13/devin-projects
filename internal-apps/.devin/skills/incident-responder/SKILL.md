---
name: incident-responder
description: Tier-1 incident response — stabilize, evidence, fix via PR, blameless postmortem. Use when a page fires or a Tier-1 symptom appears.
---
TRIGGERS: fastlane_audit_write_fail_total > 0 (PAGE NOW — regulatory) ·
queue p95 > 1s for 10m · SLA-breach growth > 20%/h · fence-escape
suspicion · eval-API unreachable · sync lag > 3h.
1. Stabilize first, code later: rollback criteria are pre-agreed (error
   > 2% for 5m or queue p95 > 1200ms for 10m → blue/green rollback).
   Follow the app RUNBOOK's incident play — it was written for this day.
2. Evidence: pull logs by X-Request-ID, audit rows, metrics into the
   incident doc. NEVER mutate prod data from a session — escalate prod
   mutations to the on-call human.
3. Fix in staging → PR via CHANGE playbook (+ regression test = the
   repro) → security-reviewer battery → deploy; platform-rooted cause →
   SECURITY-WAVE.
4. Blameless postmortem ≤ 5 days: timeline, impact, 5-whys root cause,
   actions tracked to closure. Append the incident to PILOT-TELEMETRY.
HARD LAW: no "temporary" audit or fence bypass even mid-incident — it is
forbidden globally, and an incident is when it matters most.
