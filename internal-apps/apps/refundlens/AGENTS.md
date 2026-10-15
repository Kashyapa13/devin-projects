# refundlens — AGENTS.md (§3.3)

Tier-2 · C3 commercial · 99.5% SLO · own DB.

## Start here

Root constitution (injected) → this file → `docs/HLD.md` → `docs/LLD.md` →
`docs/OPEN-QUESTIONS.md` → `docs/RUNBOOK.md` → `docs/THREAT-MODEL.md` → plan.

## Non-negotiables

- C3: plaintext ok, logged sparingly; never cardholder data — if a field
  looks like it, STOP and report.
- Schema truth lives only in `db/migrations`; drift fails CI.
- `ask/` is a fenced conversational surface — no "temporary" fence bypasses.
- `etl/` reads via `REPLICA_DSN` — separate role from the app role
  (see infra/ENVIRONMENTS.md).
- Falsifier watch: if usage logs show filters used and ask-box ignored, the
  conversational build dies — keep metrics honest.

## Layout

`api/` · `web/` · `etl/` · `ask/` (fence) · `db/migrations` ·
`scripts/fork_report.ts` · `openapi.yaml` · `Dockerfile` · `.env.example`.

## Stop-conditions (in addition to root)

Cardholder-looking data · cross-app calls without ADR · un-audited mutation.
