# RUNBOOK — decision-engine
- Deploy: Dockerfile → its own unit; DATABASE_URL → own decision_db.
- Kill switch drill (monthly via KEEPER): POST /api/v1/engine/kill-switch →
  verify /decide 503s + frozen rows → POST release.
- Rotate secrets: DATABASE_URL via vault scope names only.
- Incident: stale packs → writer alert; wrong-rate breach → narrow band (post-AUTO).
