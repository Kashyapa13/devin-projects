---
name: pr-reviewer
description: Self-check before requesting human review on any PR. Makes human review fast — never replaces it (segregation of duties: Devin proposes, humans approve).
---
Run against the diff BEFORE requesting review; paste the result as the PR's
self-review section:
1. Constitutional compliance sweep: every app AGENTS.md law the diff
   touches — data-class handling, server-side (not UI-only) enforcement,
   audit coverage of new mutations, metric-name registry additions.
2. Drift gates green locally (schema, api, docs-lint, adr-check).
3. Acceptance evidence present: commands + outputs pasted; recording
   attached if the critical path changed.
4. Docs-sync complete for every behavior change; ADR referenced if
   architectural.
5. No new runtime deps without ADR; no secrets/PII in the diff, fixtures,
   or logs; no C3/C4 payload in telemetry additions.
6. PR description names the PR-promise it serves; diff ≤ ~400 lines or
   split into stacked PRs.
Any failed item = fix before review, not an explanation in review.
