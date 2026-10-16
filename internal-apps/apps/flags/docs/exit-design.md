# flags — exit design (DORMANT)

> **DORMANT** — activates only if the flags trigger fires (replica shows a
> clear capability/run-cost advantage AND the license audit shows Premium
> spend growth — both, not either) via an ADR amendment.

The only alternative path in scope:

- Schema: `flags` / `flag_env_overrides` / `flag_targeting` (rules jsonb) /
  `audit_events` on platform patterns.
- Eval API at 99.95% multi-AZ (runtime dependency of ~60 services).
- SSE push with poll fallback (SSE wins on kill-switch latency — the
  promise that matters).
- Local-mode SDK caching (last-known state, never crash).
- Panel flip ≤10s, propagation ≤5s.

## Migration law (dormant)

- T-0 — export from the PA store → scaffold import format.
- T+1 — dual-read shim behind the FeatureFlags interface — THE only legal
  integration point; rollback = shim config, no deploys.
- T+2 — SDK waves: ~60 service repos in batches of 10 via managed Devins,
  one PR each, every PR carrying the eval-down contract test (reads
  succeed with the eval API unreachable, local-mode cache). Wave deps
  pre-approved by the migration ADR; every wave PR cites it.
- T+3 — 14-day divergence monitoring (`flags_shim_divergence_total`; any
  divergence = page + batch halt).
- T+4 — PA panel → read-only banner; retire at day 30 clean.

Shim removal: separate release, ≥2 releases after the last wave, never
same-release.
