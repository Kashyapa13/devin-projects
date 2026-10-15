# fastlane — OPEN-QUESTIONS

Unresolved forks with owner, trigger, review date (docs contract §5).

| # | Question | Owner | Trigger | Review by |
| --- | --- | --- | --- | --- |
| OPEN-1 | #license-audit — Premium seat mix behind the $250k/yr line; gates the D6 KYC strangler trigger (Premium growth OR FastLane SLA-miss win) | VP | audit report delivered (D3: 5 business days) | 2025-XX review on delivery |
| OPEN-2 | Dataverse read-only link vs full strangler for historical KYC cases | platform PAIR | D6 trigger fires | quarterly |
| OPEN-3 | Queue-count cache TTL (5s) under burst load — keep, shrink, or exact-on-demand for all tabs | fastlane owner | queue p95 >300ms for 30m (ticket alert) | next quarter |
| OPEN-4 | OTel backend not live — ADR-0017 is not on this base, so no traceparent header is emitted; e2e/telemetry.spec.ts carries a HARNESS-GAP test asserting x-request-id on every /api/v1 response and explicitly documents the absent traceparent. Wire real trace assertions once ADR-0017 lands. | platform observability | ADR-0017 lands on the base | on ADR-0017 merge |
| OPEN-5 | Supervisor reassign / bulk-assign UI not built (catalog feature "FB" future-batch). API-level deny surface is covered (auditor + reviewer mutation corpus → 403, tests/edge-envelope.test.ts); the UI flow has no target to drive. | fastlane owner | FB feature scheduled into a batch | when FB scheduled |
| OPEN-6 | pnpm audit: 3 transitive vulns (2 moderate, 1 high — braces/micromatch via @changesets dev toolchain). Not reachable at runtime; still needs a repo-wide toolchain bump decision. | repo toolchain | next pnpm audit sweep | next quarter |
