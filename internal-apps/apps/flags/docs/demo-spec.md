# flags — capability-demo spec

The capability demo (pilot): a Devin-built replica measured against the
live PA panel —

- CRUD
- env scoping (dev/staging/prod)
- typed-confirm delete
- full audit (actor/action/timestamp on every change)
- RBAC (flag_editor non-prod / flag_admin prod)
- runtime eval API: `GET /api/flags/evaluate?key=&userId=` with
  deterministic hash bucketing (same userId+key = same result), cached,
  <50ms local, stale-while-revalidate
- `/demo` page where a flip visibly changes UI

Deployed demo-grade: synthetic flags only, demo-tier deploy. Labeled on
every surface: "capability demo — production continues on Power Apps."

The replica prices what we'd own — the strongest argument for staying put.
