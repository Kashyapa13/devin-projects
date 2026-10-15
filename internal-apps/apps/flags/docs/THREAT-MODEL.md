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

| Threat | Control | Residual |
|---|---|---|
| arbitrary write to prod env flags | `flag_admin`-only on `env=prod` POST/PUT/DELETE | demo auth is header-asserted (no IdP) — acceptable at demo tier, flagged in stay-decision |
| destructive delete | typed-confirm: `DELETE /:id?confirm=<key>` must echo the exact key, else `400 CONFIRM_MISMATCH` | irreversible `deleted=true` by design |
| malformed targeting breaks eval | `JSON.parse` on write → `400 BAD_TARGETING` before it reaches the db | eval readers only see validated rows |
| eval cache staleness | `SwrCache` 30s TTL, stale-while-revalidate | ≤30s propagation lag — stated in demo-spec |
| untracked mutation | every mutation writes `flag_audit_events(actor, action, detail, at)` same-request | audit rows append-only |
| demo mistaken for production | label banner + header + spec label law | none acceptable — enforcement is constitutional |

## Forbidden by constitution (§3.4)

vendor SDK artifacts · shim semantics · unlabeling the demo · any build beyond
this labeled replica — rejected PRs.
