# ADR-0021 — Kubernetes manifests: platform templates, per-app rendered copies

Status: accepted · Date: 2026-10-16 · Governs:
`platform/packages/deploy/k8s/`, `scripts/render-deploy.sh`,
`apps/*/deploy/`, each app's compiled `api/src/migrate.ts` entry.

## Context

Every app ships the same deploy shape — own database, own image, own
rollback — but the k8s manifests existed only as two raw templates
(bluegreen + migration job) with no steady-state deployment, no scaling
policy, no pod security posture, and no per-app rendered artifacts.
Hand-writing eight manifests per app guarantees drift; the fleet's
"app #1 expensive, apps #2+ cheap" law needs the k8s surface templated
the same way the Dockerfile already is.

The migration job also could not have worked: it invoked
`node apps/${APP}/dist/migrate.js`, but (a) the per-app image serves
`dist/` as its root, and (b) `scripts/migrate.ts` is a tsx script —
absent from the prod image, which ships only `dist/` + prod deps.

## Options

- **(A) Kustomize bases + per-app overlays** — standard GitOps answer,
  but adds a kustomize toolchain dependency and overlay indirection for
  what is today eight files that differ only by name.
- **(B) envsubst templates + committed rendered manifests (chosen)** —
  `platform/packages/deploy/k8s/` holds the `${VAR}`-parameterized set;
  `scripts/render-deploy.sh` bakes per-app copies into `apps/<app>/deploy/`
  which are committed so `kubectl diff` and PR diffs show exactly what
  ships. No new toolchain: envsubst is already everywhere bash is.
- **(C) Helm chart** — a real dependency and a second release cadence;
  overkill for ClusterIP internal apps with per-app (not per-release)
  variation.

## Decision

Option B. The template set: serviceaccount (automount off), configmap
(non-secret env only — secrets stay in the vault-managed `${APP}-env`
Secret), deployment (readOnlyRootFilesystem, runAsNonRoot, drop ALL
caps, readiness=/readyz deps-probe vs liveness=/healthz no-deps,
startupProbe, tmp emptyDir), ClusterIP service, HPA on CPU (2–4),
PDB minAvailable 1, NetworkPolicy (ingress from ingress ns only;
egress DNS + Postgres CIDR + OTLP collector), and migrate-job
(`node dist/migrate.js`, backoffLimit 0 — migrations never in-request,
never auto-retry).

Each app gains a compiled `api/src/migrate.ts` entry (dist/migrate.js)
so the job runs in the prod image; `scripts/migrate.ts` stays the dev
path. New apps get `deploy/` + `api/src/migrate.ts` from `_template`.

## Tradeoffs

- Rendered copies must be re-rendered when a template changes — the
  render script is the contract; drift-checking rendered-vs-template
  is a gate candidate, not yet wired.
- ClusterIP-only is assumed; ingress is an app-level decision per
  RUNBOOK, not templated.
- HPA is CPU-only until a metrics adapter exists for p95-latency
  scaling (queue_load_ms etc.).

## Consequences

- `apps/<app>/deploy/` is generated — edit templates + re-render, never
  the rendered files.
- `api/src/migrate.ts` is part of each app's build surface; removing it
  breaks the migration job silently (no in-request fallback by design).
- A rendered-manifest drift check (template hash vs output) is a
  follow-up CI gate; NetworkPolicy DB_CIDR must be set per environment
  (infra/ENVIRONMENTS.md) before first apply.
