# refundlens — THREAT-MODEL

Top-5 threats (Tier-2 ship gate). Every mitigation maps to a platform
package, the fence, or an AGENTS.md rule — never a bespoke control.

| # | Threat | Mitigation | Package / rule |
|---|--------|-----------|----------------|
| 1 | Fence escape — generated SQL mutates data or reads outside the schema | six fences in `api/ask/` + AST validation (not regex) + read-only DB role as the DB-layer backstop + `fenced_query_rejected` never best-effort + `refundlens_fence_rejected_total` metering | LLD §Fence spec · AGENTS.md §3 · appDb read-only binding |
| 2 | Cardholder-field leakage — a source field that looks like PAN/cardholder data lands in the rollup or logs | C3-only law: STOP-and-report on sight — no mapping, no self-anonymizing; tokenized refs only; raw results banned from logs; synthetic fixtures only | AGENTS.md preamble + §6 banned fields · platform-observability log schema · data-classification.md |
| 3 | Replica overload — analytical reads hammer the production replica | the app NEVER reads the replica — only the hourly ETL does (reading primary or pointing the app at the replica = rejected PR); statement_timeout 5s + EXPLAIN cost cap bound even rollup load | AGENTS.md §2 ETL law · fence #4/#5 |
| 4 | Watermark suppression — answers served without staleness truth (silently wrong numbers) | watermark is a mandatory envelope field on every surface incl. CSV header comment; absent watermark = P1 bug; amber banner law at lag >90m | AGENTS.md §3/§4 · LLD test matrix (watermark propagation) |
| 5 | Export abuse — bulk exfil of C3 commercial data via the CSV path | exports render through the same fenced templates (LIMIT cap applies); analyst RBAC only; `refundlens_export_total` metered; exact-count law means no silent truncation hiding volume | platform-auth requireRole · AGENTS.md §3 · LLD API registry |
