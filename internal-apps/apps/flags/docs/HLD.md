# flags — HLD (capability demo)

Labeled demo replica of the PA flag panel — production unchanged (ADR-0002).
Own package `@app/flags`, own `flags` DB (per-app isolation law), demo-tier.

Pipeline: flags CRUD (RBAC: flag_editor non-prod / flag_admin prod+delete)
→ flag_audit_events write on every mutation → eval API (deterministic FNV
bucket + SWR cache, <50ms local) → /demo page flips live on `demo-hero`.

Dormant exit design lives in docs/exit-design.md — activates ONLY on the
two-condition trigger via ADR amendment. Shim law: translate, never invent.
