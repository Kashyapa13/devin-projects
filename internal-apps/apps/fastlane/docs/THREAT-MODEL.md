# fastlane — THREAT-MODEL

Top-5 threats (Tier-1 ship gate). Every mitigation maps to a platform
package or an AGENTS.md rule — never a bespoke control.

| # | Threat | Mitigation | Package / rule |
|---|--------|-----------|----------------|
| 1 | Queue enumeration — attacker scrapes case IDs/volumes via /queue | server-side RBAC + object-level checks; rate presets (queue GET 300/min/user); cursor pagination (no offset leak) | platform-auth requireRole · platform-http rateLimit · platform-db paginate |
| 2 | PII exfiltration via logs — C4 fields leak into log lines/telemetry | banned-fields law (legal_name, doc contents, assignee PII); JSON log schema enforced; masked-by-default + audited reveal | platform-observability log schema · AGENTS.md §3/§6 banned-fields · platform-crypto fieldCipher |
| 3 | Audit tampering — attacker or insider edits/deletes decision records | append-only table (REVOKE UPDATE/DELETE); same-tx writes (state change and audit row commit or die together); SIEM daily export off the primary | platform-audit auditWriter · AGENTS.md "no audit bypass" · DDL `REVOKE` |
| 4 | Signed-URL leakage — doc URL forwarded outside authorized viewers | 15-min expiry; bytes never transit the API (no copy to leak); signer key in KMS; reveal/audit correlation shows who fetched what | platform-crypto KMS provider · AGENTS.md §1 "API never proxies doc bytes" · S3 signer scope (§8 env names) |
| 5 | Privilege escalation — reviewer self-assigns escalations or acts on unowned cases | statemachine guards run server-side in the pure module; supervisor-only ESCALATED→IN_REVIEW edge; DB CHECK backstop; every attempt logged via transition_total{ok=no} | statemachine/ pure module · platform-auth rolesMatrix · LLD RBAC matrix · §4 transition table |
