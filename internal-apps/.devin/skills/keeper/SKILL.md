---
name: keeper
description: Scheduled upkeep — weekly deps/gates, month-end drills, quarterly audits. Use for the keeper.yml cadence sessions.
---
WEEKLY: bump patch-level deps across apps/ (lockfile-only may carry
docs-unchanged; minor/major requires an ADR) · run every suite + drift
gates + template-smoke; anything red → fix in-session or file + Slack
alert to owner · surface stale-platform markers (non-security bumps ride
the app's next natural deploy) · check OPEN-QUESTIONS review dates, ping
owners of expired forks · append session to PILOT-TELEMETRY (ACU, hours,
findings).
MONTH-END: execute the staging PITR restore drill for fastlane per its
RUNBOOK; append results to PILOT-TELEMETRY.
QUARTERLY: mock audit — pick 10 random merged PRs, produce the full
evidence chain (plan → PR → CI → recording) in <1h; report gaps ·
dependency-risk review (CVEs in the tree beyond patch bumps → SECURITY-
WAVE playbook if platform).
STOP: any prod mutation (keeper never touches prod data) · minor/major
upgrades without an ADR.
