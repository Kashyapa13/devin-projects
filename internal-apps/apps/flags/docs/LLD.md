# flags — LLD (capability demo)

## Schema (commentary — db/migrations is truth)
- `flags` — (id, key, env dev|staging|prod, targeting jsonb, deleted, created_at); UNIQUE(key,env)
- `flag_audit_events` — (id, flag_id→flags, actor, action, detail jsonb, at); index `flag_audit_flag_idx`

## Endpoints
GET/POST /api/flags · PUT /api/flags/:id · DELETE /api/flags/:id?confirm=<key>
(typed-confirm: mismatch → 400 CONFIRM_MISMATCH) · GET /api/flags/evaluate
?key=&userId=&env= · GET /api/flags/audit. Demo auth: `x-demo-role` header
(viewer/flag_editor/flag_admin) + `x-demo-actor`.

## Feature Catalog — see docs/demo-spec.md (authoritative, F-01..F-09)
| F | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-01..F-09 | panel CRUD, env scoping, typed-delete, audit, RBAC, eval API, targeting validation, /demo flip | **built — this PR** | tests/flags.test.ts; walkthrough recording |

## Panel UX pass (this PR)
The panel wears the fleet visual language (ADR-0018): glass `.appbar` with
the demo pill + role select + command dock, `.table-card`/`table.rows`
borderless flag + audit tables (env chips — dev info / staging warn / prod
bad, on/off pills, tabular-mono keys + timestamps), `.flagform` glass
create row with `.seg` env segmented control, `.flip-zone` /demo hero
panel that repaints on flag state, `.demo-label` amber notice on the page
top (the mandated label, never unlabeled), error-card for API errors.
`web/src/styles.css` is a **local mirror** of `@company/ui/styles.css`
because this branch predates the fleet stack — delete it and switch
`main.tsx` to `import "@company/ui/styles.css"` once both lines land on
main (header comment says the same). i18next wired via `initI18n` +
`web/src/strings.ts` — all strings externalized (hard gate).
