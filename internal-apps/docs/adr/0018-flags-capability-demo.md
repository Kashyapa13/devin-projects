# ADR-0018 — flags capability demo: deployment unit, schema, API, demo auth

Status: accepted (this PR) · Scope: `apps/flags/` demo-tier only · Supersedes nothing · Amends nothing — sits under ADR-0002 (stay on Power Apps).

## Context

The stay decision (ADR-0002) permits exactly one in-repo flags artifact: the
labeled **capability demo** specified by `apps/flags/docs/demo-spec.md`, used to
measure what a Devin-built flag system would cost to own. It introduces a
schema (`flags`, `flag_audit_events`), an API surface (flag CRUD + env scoping
+ typed-confirm delete + audit list + runtime `evaluate`), a panel web app, and
a deployment unit — each of which is an architectural decision requiring a
record under the root constitution. This ADR is that record.

## Options

1. **Serve the panel from the API** (single OCI unit: Fastify serves `dist-web/`
   plus the JSON API). Simple; matches the one-deployment-unit-per-app law.
2. Separate static host + API — doubles the deploy surface for a demo.
3. Demo auth via real SSO — rejected: no IdP wiring belongs in a demo; the
   point is demonstrating the RBAC matrix, not enterprise auth.
4. Free-form flag keys — rejected: the demo law requires synthetic data only.

## Decision

- **One deployment unit**: `apps/flags/Dockerfile` ships `dist/` (API) +
  `dist-web/` (panel); Fastify's not-found handler serves the SPA for non-`/api`
  GETs (`/` and `/demo` resolve in the container, not only under vite dev).
- **Schema** as authored in `db/migrations/0001_init.up.sql`: `UNIQUE (key, env)`
  with soft delete (`deleted`); recreate revives the soft-deleted row in the
  same transaction so `flag_audit_events.flag_id` history stays linked.
- **Demo auth** is intentionally caller-chosen: `x-demo-role` /
  `x-demo-actor` headers. This is the demo-spec F-06 mechanism for exercising
  the role matrix (viewer → read; flag_editor → non-prod writes; flag_admin →
  prod + typed-confirm deletes). It is NOT a security boundary — demo-tier,
  synthetic flags only, and every surface (UI + `x-demo-label` response header)
  carries "capability demo — production continues on Power Apps". Any path to
  real use requires the dormant exit design + a new ADR, not a patch here.
- **Synthetic-only enforcement**: create rejects keys not matching
  `^demo-[a-z0-9][a-z0-9-]*$` — real flag keys can never enter the demo store.
- **Targeting validation**: `enabled_if.bucket_lt` must be a finite number in
  `[0, 100]`; invalid shapes get `400 BAD_TARGETING` on both create and update.
  Eval semantics: `enabled_if.bucket_lt` gates the decision when present;
  `default_enabled` is the base switch the panel flip edits.
- **Mutations are transactional**: flag write + audit row commit or roll back
  together (`withTx`); the eval cache (`SwrCache`) invalidates post-commit and
  is race-safe (generation counter + in-flight coalescing + clear-on-invalidate).

## Tradeoffs

- Single-unit static serving is a demo convenience; a real flag panel would
  front a CDN. Noted, not built.
- Caller-chosen roles are *the point of the demo* (RBAC matrix made visible);
  they are also why this code can never graduate without the exit-design ADR.
- `enabled_if` > `default_enabled` precedence is documented in the panel
  (bucket chip) because a flip on a rule-bound flag does not change evaluated
  outcomes — an honest presentation of flag semantics, not a panel bug.

## Consequences

- The demo is self-contained: `flags-pg` + one container serves API + panel.
- Test coverage now includes the RBAC role×route matrix, targeting validation,
  demo-key enforcement, exact-env evaluate, soft-delete revive, and the error
  envelope — run via `pg-mem` (no Docker needed for route tests).
- Deferred (tracked in `apps/flags/docs/OPEN-QUESTIONS.md`): Playwright e2e in
  both motion modes per the TESTING charter — the demo currently relies on the
  recorded UX walkthrough + route-level tests.
