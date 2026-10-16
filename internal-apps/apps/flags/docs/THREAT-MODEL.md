# THREAT-MODEL — flags capability demo

Label law: every statement below describes the **capability demo — production
continues on Power Apps**. The production PA panel is out of scope; no path
here touches it.

## Scope

Demo-tier replica of the flag panel over synthetic `demo-*` flags only.
Attackers of the demo can damage the demo DB and nothing else.

## Trust boundaries

| Boundary | Crossing | Guard |
|---|---|---|
| browser → api (`/api/*`) | role header `x-demo-role` drives RBAC | `flag_editor` writes non-prod envs; `flag_admin` writes prod + deletes; everything else viewer |
| api → demo db | pg parameterized queries only | no string-built SQL; targeting JSON parsed before write |
| api → client | label header `x-demo-label` on every response | demo label is immutable contract |

## Threats → controls

Evidence column: `tests/` = vitest (pg-mem), `e2e/` = Playwright page-object
suite, `live` = executed curl battery against the running API (results pasted
in the testing PR). All listed checks currently pass.

| Threat | Control | Evidence | Residual |
|---|---|---|---|
| arbitrary write to prod env flags | `flag_admin`-only on `env=prod` POST/PUT/DELETE | `tests/api.test.ts` RBAC matrix (POST ×6, PUT ×3); `e2e/panel.spec.ts` F-06; live role sweep: viewer/none/bogus → 403 on all mutations, editor → 403 on prod only | demo auth is header-asserted (no IdP) — acceptable at demo tier, flagged in stay-decision |
| destructive delete | typed-confirm: `DELETE /:id?confirm=<key>` must echo the exact key, else `400 CONFIRM_MISMATCH` | `tests/api.test.ts` golden CONFIRM_MISMATCH + missing-confirm + 404-after-delete; `e2e/panel.spec.ts` F-04 verbatim | irreversible `deleted=true` by design |
| malformed targeting breaks eval | `JSON.parse` on write → `400 BAD_TARGETING` before it reaches the db | `tests/api.test.ts` POST+PUT BAD_TARGETING (row unchanged asserted); `e2e/panel.spec.ts` F-08 | eval readers only see validated rows |
| eval cache staleness | `SwrCache` 30s TTL, stale-while-revalidate | `tests/eval.test.ts` — TTL hit/miss, stale-serving on failed reload, recovery | ≤30s propagation lag — stated in demo-spec |
| untracked mutation | every mutation writes `flag_audit_events(actor, action, detail, at)` same-request | `tests/api.test.ts` F-05 audit rows join flags; `e2e/panel.spec.ts` F-02/F-04/F-05 assert audit after each mutation | audit rows append-only |
| demo mistaken for production | label banner + header + spec label law | `tests/api.test.ts` label law block (header on success+error, body label); `e2e/panel.spec.ts` F-01 banner; `e2e/eval-demo.spec.ts` F-07 header on eval | none acceptable — enforcement is constitutional |
| SQL injection via API inputs | parameterized queries only (api → demo db boundary above) | live corpus: 7 payloads (`' OR 1=1--`, `; DROP TABLE`, UNION, traversal, NUL, jndi, XSS) on `evaluate` → golden `404 NOT_FOUND` each; injected `description` stored as inert data; tables intact post-run | none found — corpus committed as PR evidence |

## Executed checks (non-test)

| Check | Command | Result |
|---|---|---|
| secrets scan | `gitleaks git .` | 80 commits, no leaks |
| dep audit | `pnpm audit --prod` | 1 moderate (uuid via testcontainers), 0 high/critical in production deps |
| dep audit (dev incl.) | `pnpm audit` | +1 high `braces` via `@changesets/cli` root dev tooling — pre-existing on base, dev-only, filed P2 in OPEN-QUESTIONS |
| ciphertext sweep | n/a — flags stores C2 config only, no C3/C4 fields exist in schema (`db/migrations/0001_init.up.sql`) | not applicable by inspection |

## Forbidden by constitution (§3.4)

vendor SDK artifacts · shim semantics · unlabeling the demo · any build beyond
this labeled replica — rejected PRs.
