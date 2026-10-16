# k8s manifest templates

Rendered per app by `scripts/render-deploy.sh <app>` into
`apps/<app>/deploy/` — rendered manifests are committed so `kubectl diff`
and GitOps diffs stay reviewable. Substitution vars:

| Var | Default (render script) | Meaning |
|---|---|---|
| `${APP}` | required | app dir name (fastlane, refundlens, …) |
| `${NAMESPACE}` | `internal-apps` | target namespace |
| `${IMAGE}` | `registry.internal/${APP}:${REVISION}` | pushed image ref |
| `${REVISION}` | git short sha | image tag + pod label |
| `${PORT}` | `8080` | container/http port |
| `${REPLICAS}` / `${MIN_REPLICAS}` / `${MAX_REPLICAS}` | `2` / `2` / `4` | scaling floor/ceiling |
| `${DB_CIDR}` | `10.0.0.0/8` | Postgres egress range (per env) |
| `${SERVER_ENTRY}` / `${MIGRATE_ENTRY}` | derived | compiled entry paths — auto-derived from `tsconfig.build.json` `rootDir` (flat `dist/` vs `dist/api/src/`); override only if the build layout changes |

Gate order per deploy: `migrate-job.yaml` → wait complete →
`deployment.yaml` (+ `bluegreen.yaml` for the cutover track) →
`service.yaml`. `serviceaccount`/`configmap`/`hpa`/`pdb`/`networkpolicy`
apply once per app. Migrations never run in-request (AGENTS.md).
