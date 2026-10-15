---
name: app-building
description: Instantiate a new internal app from apps/_template per the docs contract. Use when creating any new app in this monorepo.
---
GATE ZERO: confirm the app's press release exists and is routed to the
Devin lane (ROUTING-PLAYBOOK intake gate). No PR, no build.
1. cp -r apps/_template apps/<name>. Fill AGENTS.md.template TODOs per the
   app's data class: C4 → FastLane-grade PII law (masked-by-default,
   audited reveal, same-tx audit, field encryption); C3 → cardholder-STOP
   + read-only-by-default (+ maker-checker ADR if it mutates); C2 →
   default controls.
2. Author docs/ BEFORE code — HLD (tradeoff tables; every rejected
   alternative states its cost), LLD (DDL, API registry, RBAC matrix,
   exact observability names, test matrix, capacity envelope),
   THREAT-MODEL (top-5 threats, each mitigation mapped to a platform
   package or AGENTS.md rule), OPEN-QUESTIONS (forks with owner +
   trigger + review date), RUNBOOK skeleton.
3. Build laws: migrations as raw SQL (expand-contract, tested down.sql)
   via platform-db · routes via platform-http envelope · RBAC server-side
   via platform-auth · audit same-transaction via platform-audit · C4
   fields via platform-crypto · UI via platform-ui (keyboard-first where
   the PR promises it) · seeder via platform-testing (deterministic named
   seed, zero PII-shaped values).
4. Acceptance = executed commands with outputs pasted (rules #7/#8);
   computer-use walkthrough recorded for the critical path; every §-gate
   of the app constitution mapped to a passing test.
5. Wire drift gates + path-filtered pipeline for the app; PR = code +
   tests + docs together; run pr-reviewer skill before requesting human
   review. Target: CRUD-class app green in <1 day.
STOP: app needs NEW platform capability (→ ADR + platform session, never
app code) · PII-shaped fixtures · doc/code conflict · ADR contradiction.
KNOWN FAILURE MODES (auto-reject): building before the LLD exists;
inventing platform code inside an app; softening a gate to make CI pass.
