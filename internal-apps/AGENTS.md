# internal-apps — Root Constitution

This monorepo hosts the company's internal tools program. Three build lanes:
Power Apps (forms/approvals on M365 data — analyst-maintained, NOT in this
repo), Devin-built apps (this repo), Power BI (reporting — not in this repo).
Commodities are bought, never built (see apps/flags and ADR-0002).

## Platform stack (fixed; changes require an ADR)
Node 22 LTS, TypeScript strict, ESM · Fastify + TypeBox · Drizzle with
raw-SQL migrations · Postgres 16 · React 19 + Vite PWA, Tailwind, platform/ui
· TanStack Query · i18next (all strings externalized — hard gate) · Vitest /
Testcontainers / Playwright (keyboard-mode) / k6 / axe-core · structured JSON
logs with X-Request-ID correlation · metrics via platform-observability.

## The docs contract — non-negotiable
1. BEFORE planning any change: read the TARGET app's AGENTS.md and its
   docs (HLD.md, LLD.md, OPEN-QUESTIONS.md). This file is auto-injected at
   session start; if your tooling did not inject it, read it first. Conflicts
   between docs and request: STOP and ask — never resolve silently.
2. Schema truth lives ONLY in db/migrations. LLD's schema section is
   commentary; CI diffs migrations against LLD; drift fails the build.
3. Any PR that changes behavior updates the matching doc section in the SAME
   PR. "Code first, docs later" is a rejected-PR offense.
4. Architectural decision (DB, state machines, API shape, topology, any
   platform/ change) → docs/adr/NNNN-slug.md: Context / Options / Decision /
   Tradeoffs / Consequences. Immutable once merged; amend by new ADR.
5. OPEN-QUESTIONS.md holds unresolved forks with owner, trigger, review date.
6. RUNBOOK.md answers deploy, rollback, rotate secrets, restore backup,
   common incidents — sessions that touch these update the runbook.

## Repo & deployment law
1. Monorepo = source home only. Deployment units are per-app: one OCI image,
   one version stream, one pipeline, one rollback per app.
2. Pipelines are path-filtered: apps/<app>/** triggers that app only;
   platform/** triggers ALL apps (security-wave: FastLane canary 30–60 min,
   then all, each gated on its own smoke suite). Security scans
   (security.yml) are NEVER path-filtered.
3. platform/ ships as build-time workspace packages (@company scope). It is
   NEVER a runtime service apps depend on. Publishing a platform package to
   the private registry requires: own tests, CHANGELOG, stable-API ADR.
4. Dependency direction is one-way: apps → platform; platform → nothing
   app-specific; apps ↛ apps. import-lint enforces; violations fail CI.
5. Each app owns its own database. No shared databases, no cross-app calls
   without an ADR. Any app may graduate to its own repo via ADR (ownership
   change, versioned platform releases, cadence divergence).

## Data classification
C4 regulated PII (KYC names/docs): app-layer AES-256-GCM + KMS envelope,
never in logs/telemetry/prompts/non-prod, synthetic fixtures only.
C3 commercial (transaction metadata, tokenized refs): plaintext ok, logged
sparingly; never cardholder data — if a field looks like it, STOP and report.
C2 internal config: normal handling. C1 public: docs/deps.

## Session protocol (every Devin session in this repo)
START: (this file — already in your context) → the app's AGENTS.md → the
app's docs → OPEN-QUESTIONS → then plan.
STOP-CONDITIONS: PII in non-prod; doc/request conflict; new state transition,
endpoint, or schema change without ADR; anything under platform/; request
contradicting an ADR (propose amendment instead).
DONE means: code + tests + docs updated + drift gates green + (if
architectural) new ADR + PR description names the PR-promise it serves.

## Forbidden globally
Generated migrations not reviewed as raw SQL · secrets in repo/env files ·
new runtime deps without ADR · direct prod DB access from sessions ·
"temporary" audit or fence bypasses · client-side-only enforcement of
server-side rules · logging C3/C4 payloads.
