---
name: security-reviewer
description: Pre-flight adversarial battery before any release, and for any PR touching auth/audit/crypto/fence/platform. Runs the checks the PV verifier will later re-run independently.
---
Execute every check; paste command + output per row into the release PR:
1. Role-matrix sweep: call every mutation endpoint as each wrong role +
   unauthenticated → 401/403 everywhere expected.
2. PII reveal then audit query: reveal via the UI/route, then SELECT the
   audit table → row with actor + timestamp MUST exist.
3. Illegal transitions: POST every forbidden edge (incl. refund
   self-approval if mutations exist) → 409/403.
4. Ciphertext check: raw SELECT of C4 fields → ciphertext only.
5. Injection payloads into every filter/search input; banned query via
   /ask → fenced_query_rejected (RefundLens).
6. Secrets scan (gitleaks) + pnpm audit; fail on high.
7. Threat-model cross-check: every top-5 mitigation present in the diff's
   app, mapped to its platform package.
8. Prod-readiness checklist (Part 7) row-by-row with evidence links.
Any failed row blocks release. Overrides require a VP-tagged exemption —
never a reviewer's good will.
