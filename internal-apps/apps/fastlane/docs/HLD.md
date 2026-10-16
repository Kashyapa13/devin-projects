# FastLane — HLD

KYC review queue (Tier-1, Devin-built).

## Architecture

Analyst —SSO(OIDC)→ LB/WAF → FastLane API → Postgres multi-AZ PITR; S3 KYC
docs (signed URLs only); audit_events append-only same-tx; PWA static CDN;
scheduled SLA digest → Slack; legacy Dataverse app = READ-ONLY historical
cases (pilot posture: linked, not synced; full strangler cutover only behind
the Part 7 D6 trigger).

## Tradeoff table (chosen + rejected with cost)

| Decision | Chosen | Rejected (and its cost) |
|---|---|---|
| Database | RDS Postgres Multi-AZ, PITR (provisioned) | Aurora Serverless — cold starts violate the <1s queue promise; SQLite — no HA/PITR for Tier-1 |
| State machine | App layer + DB CHECK + transition allow-table | DB triggers alone — business rules untestable, unmigratable |
| Audit | Same-transaction append | Async — crash = unaudited decision; unacceptable for AML records |
| KYC documents | 15-min signed URLs from object storage | Proxy through API — app becomes a C4 data processor for zero benefit |
| Queue counts | Cached (5s TTL) + exact on demand | Live COUNT(*) — kills <1s load; estimates — "never silently wrong" applies to numbers |
| Historical cases | Link-out (strangler) — history stays read-only in Dataverse for retention | Migration — audit chain-of-custody risk for zero user value |
