# @company/deploy

Base image + deploy templates + env var registry. Per-app deploys — one
image, one pipeline, one rollback (law §1).

## Contents

- `docker/Dockerfile.base` — multi-stage (build → runtime), non-root
  `USER app`, `HEALTHCHECK` on `/healthz`.
- `deploy/bluegreen.yaml` — blue/green Deployment + Service template;
  rollback = flip the `track:` selector.
- `deploy/migration-job.yaml` — pre-deploy Job running the app's
  `migrate.js up`; `backoffLimit: 0` (migrations never auto-retry).
- `envVarRegistry(specs)` — validates env var specs: `NAME` +
  `vault:<env>/<app>` ref + env list. Literal values are rejected by
  design — vault only (infra/ENVIRONMENTS.md).
- Path exports: `DOCKERFILE_BASE`, `BLUEGREEN_TEMPLATE`,
  `MIGRATION_JOB_TEMPLATE`.

## Usage

```dockerfile
# apps/<app>/Dockerfile — FROM the base or copy when outgrowing it
```

```ts
import { DOCKERFILE_BASE, envVarRegistry } from "@company/deploy";
const env = envVarRegistry(appEnvSpec); // throws if a value snuck in
```
