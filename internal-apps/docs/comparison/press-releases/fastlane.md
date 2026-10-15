# Press release — FastLane

**FastLane clears the KYC review queue.** Compliance analysts open a
keyboard-driven console, take the next case, see the evidence, and decide —
approve, reject, or escalate — in under a minute. Every decision is recorded
in the same transaction as the state change, so the audit trail is the
application, not a report assembled later.

## The customer problem

KYC reviews run today in a queue app whose page-loads take seconds and whose
audit trail is reconstructed manually. At current volume that means missed
SLAs, reviewers waiting on tooling, and audit season becoming its own
project.

## The solution

FastLane is a queue-first review console: one screen, real keys (j/k move,
a approve, r reject, c complete), no mouse required. Case evidence renders
inline; C4 identifiers are encrypted at rest with envelope crypto and are
masked by default — an unmask click writes an audit row before the value
returns. Decisions are state-machine transitions, not edits: each carries
its guard, its required role, and its audit event in one transaction.
Health and readiness endpoints, RED metrics, and blue/green deploys come
from the platform, not from this app.

## What customers get

- Queue clear-time −40% vs the current app (see KPI-DASHBOARD).
- Queue p95 <1s; reviewers stop waiting on the tool.
- 100% of decisions audited — the audit log is complete by construction.
- A runbook: deploy, rollback, rotate secrets, restore.

## Internal FAQ

**Why not Power Apps?** The queue UX and the same-transaction audit
requirement are engineering-grade guarantees; Power Apps' strengths are
forms and workflow, not sub-second keyboard consoles with cryptographic
audit envelopes. See POWERAPPS-COMPARISON.md §1.

**Why not the existing app extended?** The existing app's model predates
the audit and C4 requirements; retrofitting both costs more than the
strangler path in D6 — and leaves the regulated record split across two
systems mid-migration.

**What does it cost?** Per FACTS.md [EST]: 1–3 eng-weeks + $50–500 agent
spend to build; steady-state platform share inside the $210–340k/yr
envelope — vs per-seat licensing for every reviewer (see §2 cost model).

**What if Devin lane underperforms?** D4 caps the blast radius: review
turnaround >48h sustained shrinks the lane to consoles-only.
