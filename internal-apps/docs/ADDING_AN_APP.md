# Adding an app — the fleet playbook

How "app #1 is expensive, apps #2+ are cheap" becomes mechanically true.
Pairs with [.devin/skills/app-building/SKILL.md](../.devin/skills/app-building/SKILL.md)
— the skill runs this playbook end-to-end in a session.

**Measurable target: a CRUD-class app green (scaffold → docs → build →
CI gates → image) in <1 day.**

## Before touching the repo

GATE ZERO (from the app-building skill): the app's press release exists
and it is routed to the Devin lane by `docs/comparison/ROUTING-PLAYBOOK.md`.
No PR, no build — a routed request is the entry ticket.

## The five steps

### 1. Scaffold

```bash
cp -r apps/_template apps/<name>
mv apps/<name>/AGENTS.md.template apps/<name>/AGENTS.md
for f in apps/<name>/docs/*.md.template; do mv "$f" "${f%.template}"; done
# rename the package: "name": "@app/<name>" in apps/<name>/package.json
```

`pnpm install` links it — `apps/*` is in the workspace (the template
itself is excluded so its `@app/template` name never collides).
`template-smoke` in CI re-proves the zero-edit gate on every change to
_template or platform.

### 2. Pick the data class → the controls come with it

| Class | Default controls (already built — wire, don't write) |
|---|---|
| C4 regulated | platform-crypto fieldCipher on every C4 column · masked-by-default UI + audited reveal (audit row BEFORE value returns) · same-tx audit on every mutation via platform-audit · synthetic-only fixtures |
| C3 commercial | plaintext sparingly · cardholder-looking field = STOP and report · read-only-by-default + maker-checker ADR before any mutation |
| C2 internal | default controls |
| C1 public | docs/deps only |

Fill `AGENTS.md` TODO markers per the chosen class — the field-level
table is the contract, not prose.

### 3. Wire roles in platform-auth

`rolesMatrix` gains the app's role set (e.g. `reviewer / supervisor /
admin`); routes guard with `requireRole(...)` **server-side** — the RBAC
matrix lives in LLD and the test matrix is roles × endpoints.
Sessions come from `sessionPlugin` (8h TTL); OIDC via `verifyIdToken`.

### 4. Create the logical DB

One database per app — `appDb(dsn, {expectedDb})` binds and refuses
cross-app access. Schema is raw SQL: `NNNN_name.up.sql` + `NNNN_name.down.sql`
pairs (expand-contract; down tested in CI via `migrationRunner`).
Cursor pagination only (`paginate`) — offsets race on mutating queues.

### 5. Deploy config

- `Dockerfile` mirrors `platform-deploy` `Dockerfile.base`
  (`--build-arg APP_DIR=<name>`, `PKG_NAME=@app/<name>`) — multi-stage,
  non-root, `/healthz` healthcheck.
- Blue/green via `deploy/bluegreen.yaml`; migrations run as the
  `deploy/migration-job.yaml` job (never in-request).
- Env vars: names + `vault:` refs registered in `envVarRegistry` —
  values never in repo or env files. `.env.example` lists names only.
- Pipeline: path-filtered on `apps/<name>/**`; platform changes trigger
  the security-wave for ALL apps.

## Docs duty (the contract, same PR)

HLD (tradeoff table — rejected alternatives costed) → LLD (DDL commentary,
API registry, RBAC matrix, observability names, test matrix, capacity
envelope) → THREAT-MODEL (top-5, each mitigation mapped to a platform
package or AGENTS.md rule) → OPEN-QUESTIONS (owner + trigger + date) →
RUNBOOK skeleton. LLD before code — building first is the known failure
mode the skill auto-rejects.

## Worked example: transaction-limits admin

A worked end-to-end run of this playbook. The app: an admin console where
ops sets per-merchant transaction caps (CRUD + approval audit). Data
class C3 → controls: plaintext, read-only default lifted by the mutation
ADR, maker-checker on cap changes > $5,000.

1. **PR (press release + routing)** — "Ops changes a limit in 30s with a
   full audit trail, instead of a ticket to engineering." Routed: speed/
   console over own systems → Devin lane. Est. half-day.
2. **Scaffold** — `cp -r apps/_template apps/transaction-limits`; rename
   `.template` files; `package.json` → `@app/transaction-limits`.
   `pnpm install && pnpm -F @app/transaction-limits test` — green
   immediately (the template's gate).
3. **Docs-first** — HLD: Fastify API → own `transaction_limits` DB →
   Slack audit digest; rejected "mutate the prod refunds DB" (couples
   Tier-2 admin to prod writes — the cost row). LLD: `limits` table DDL,
   API registry (GET /limits, POST /limits/:id/bump — Idempotency-Key +
   maker-checker guard), RBAC (ops_editor / ops_approver), metrics
   `tl_*`. THREAT-MODEL top-5 → platform-auth/audit/http rows.
4. **Build** — migration `0002_limits.up/down.sql` (raw, reviewed);
   routes via platform-http envelope; `requireRole("ops_editor")` +
   approver-different-from-proposer guard; `auditWriter(tx, event)` in
   the same tx as the limit change; queue page via platform-ui
   QueueTable + `useKeyboardNav` (j/k to move, a to approve) + i18next
   strings in `web/src/strings.ts`; seed `tl-seed-v1` via platform-testing.
5. **Gates** — `pnpm -F @app/transaction-limits lint test build` green;
   drift stubs replaced by the app's real checkers as they land;
   template-smoke still green (platform untouched); PR = code + tests +
   doc sections together, pr-reviewer skill run before human review.
6. **Live** — image via the template Dockerfile; blue/green deploy;
   auto-rollback thresholds from AGENTS.md §8; DONE when the runbook
   answers deploy/rollback/rotate/restore.

That is the <1-day shape: scaffold minutes, docs ~2h, build ~3h, gates +
review ~1h. The platform carries auth/http/audit/crypto/db/ui/testing/
deploy; the app writes only what is genuinely new.

## Never do

- Platform-shaped code inside an app (→ ADR + platform session instead).
- Runtime dependency on `platform/` (build-time only, `workspace:*`).
- Cross-app imports or shared DBs (import-lint + appDb refuse).
- Generated migrations unreviewed as raw SQL · secrets in repo ·
  client-side-only enforcement of server-side rules.
