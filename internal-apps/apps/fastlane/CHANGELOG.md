# Changelog

## 0.1.0 — foundation + /queue anchor
- Foundation: migrations 0001 (up/down tested), table-driven statemachine,
  REGISTRY-driven routes (envelope, Idempotency-Key, req-id, rate-limit
  presets), same-tx audit, fieldCipher on legal_name, sessionPlugin RBAC,
  generated openapi.yaml, Dockerfile from platform-deploy base.
- Anchor: /queue (tabs, risk filter, pills/badges/chips, cursor paging,
  j/k/Enter/c/a/r) + /cases/[id] (c/a/r/n/e, audited PII reveal, audit
  timeline, Esc) — keyboard-only e2e recorded.
- Remaining Feature Catalog entries ship per-entry via FB sessions.
