# flags — capability-demo spec (authoritative Feature Catalog)

The capability demo (pilot): a Devin-built replica measured against the
live PA panel. **Every surface is labeled "capability demo — production
continues on Power Apps."** Synthetic flags only, demo-tier deploy.
The replica prices what we'd own — the strongest argument for staying put.

| F-NN | Feature | Screen | Role | Interaction | Acceptance assertion |
| --- | --- | --- | --- | --- | --- |
| F-01 | Flag list | `/` (panel) | viewer+ | table of flags with env badges | all flags listed with per-env state; PR-promise: demo catalog |
| F-02 | Flag create | `/` | flag_editor | form → POST /api/flags | new flag appears in list + audit row `create` |
| F-03 | Env scoping | `/` row | flag_editor | dev/staging/prod toggles → PUT override | each env flips independently; override row + audit |
| F-04 | Typed-confirm delete | `/` row | flag_admin | type the flag key → DELETE | wrong text 400s; correct text deletes + audit `delete` |
| F-05 | Full audit | `/audit` | viewer+ | timeline table | every mutation shows actor/action/timestamp |
| F-06 | RBAC | all API | — | flag_editor: non-prod envs only; flag_admin: prod + deletes | editor prod-write → 403; admin passes |
| F-07 | Eval API | `GET /api/flags/evaluate?key=&userId=` | any | JSON result | same userId+key → same result (deterministic bucket); cached + stale-while-revalidate; p95 <50ms local |
| F-08 | Invalid targeting | `/` row | flag_editor | targeting rules JSON editor | malformed JSON → 400 with actionable copy, no write |
| F-09 | `/demo` flip page | `/demo` | viewer+ | flag-on vs flag-off UI | flipping the demo flag visibly changes the page live |

Label law: header banner on `/` and `/demo`, API responses carry
`"demo": true`, seed flags are synthetic (`demo-*` keys).
