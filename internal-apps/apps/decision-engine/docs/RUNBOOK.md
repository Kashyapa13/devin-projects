# RUNBOOK — decision-engine
- Deploy: Dockerfile → its own unit; DATABASE_URL → own decision_db.
  K8s manifests: `deploy/` (rendered — `scripts/render-deploy.sh
  decision-engine`); migrate-job runs `dist/api/src/migrate.js`.
- Kill switch drill (monthly via KEEPER): POST /api/v1/engine/kill-switch →
  verify /decide 503s + frozen rows → POST release.
- Rotate secrets: DATABASE_URL via vault scope names only.
- Incident: stale packs → writer alert; wrong-rate breach → narrow band (post-AUTO).
- Auth: ENGINE_API_TOKEN (vault-scoped name only) — every /api/v1/engine/*
  caller presents X-Engine-Token; service fails closed when unset.
- Audit mirror: rows in decision_outbox relay to FASTLANE_AUDIT_URL; pending
  rows are durable — replay until sent_at is set.
