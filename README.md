# Devin vs Power Apps — build-vs-buy evaluation prototype

This repository is the working-prototype deliverable for a build-vs-buy
evaluation: can Devin replace a $250K/yr Microsoft Power Apps estate for a
Series C fintech's internal tools?

Everything lives in [`internal-apps/`](internal-apps/) — four apps (a KYC
review queue, a refunds analytics dashboard, a labeled feature-flags demo,
and a shadow decision engine), a shared platform of nine packages, and
OpenTelemetry throughout. CI workflows at this repo's root gate every PR:
semantic titles, drift checks, security scans.

## Run it

```bash
cd internal-apps
pnpm install
docker compose up -d
```

Then follow the per-app quickstarts in
[internal-apps/README.md](internal-apps/README.md) — FastLane (KYC queue),
RefundLens (dashboard + ask box), decision-engine (shadow rung), flags
(capability demo).

## Read the reasoning, not just the code

- [internal-apps/README.md](internal-apps/README.md) — what this is, how
  to run it, and what it does not prove (open items listed, not hidden)
- [internal-apps/docs/comparison/](internal-apps/docs/comparison/) — the
  Power Apps comparison, cost model, routing playbook, pilot telemetry
- [internal-apps/docs/adr/](internal-apps/docs/adr/) — 21 decision records,
  each with rejected alternatives and their costs
- [internal-apps/docs/LOOM-SCRIPT.md](internal-apps/docs/LOOM-SCRIPT.md) —
  the five-minute presentation script

## Posture

Claims here are builder-asserted until the independent verifier runs —
that pass is deliberately not run yet. The open items (live-tier
production wiring, golden-set adjudication, operator surfaces) are
recorded in the inner README's Honest limitations section rather than
glossed. Plain TypeScript and Postgres throughout: the client owns the
exit.
