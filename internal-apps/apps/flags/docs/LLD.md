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
