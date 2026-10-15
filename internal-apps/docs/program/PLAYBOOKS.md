# The standing playbook library (every session after the pilot)

One playbook per recurring session type — use the matching playbook, never
freehand a recurring job.

## 1. CHANGE (the everyday template)

Read root AGENTS.md + docs contract + the target app's AGENTS.md +
HLD/LLD/RUNBOOK + OPEN-QUESTIONS. One concern per session — new scope =
new session.
TASK: <change>.
ACCEPTANCE (testable assertions from the PR-promise list — no adjectives):
<assertions>.
EXECUTE per the app's constitution; run pr-reviewer + docs-keeper skills
before requesting human review; acceptance proven by executed commands
with outputs pasted; recording attached if the critical path changed.
DOCS DUTY: every touched doc section updated in this PR; architectural →
new ADR per the ADR playbook; contradiction with an ADR → STOP and
propose the amendment instead of building around it.

## 2. NEW-APP (net-new apps 4–13)

1. Write the press release first (half-day, Part 5 format: headline, the
   user's bad day, the promises). No PR, no build.
2. Route via the Intake Gate (ROUTING-PLAYBOOK): reads like a vendor
   homepage → escalate to owner; forms/M365 data → Power Apps lane (not
   this repo); answers → PBI or Devin conversational; speed/keyboards/
   consoles over own systems → proceed.
3. Proceed = app-building skill end-to-end (scaffold → docs-first →
   build → gates → PR), following docs/ADDING_AN_APP.md. Record
   time-to-green in PILOT-TELEMETRY against the <1-day CRUD-class target.
4. Any fork discovered mid-build → OPEN-QUESTIONS entry (owner, trigger,
   review date) — never resolved silently.

## 3. BUG (Slack intake / Auto-Triage)

Trigger: a bug report in the tools Slack channel or an Auto-Triage
hand-off.
1. Reproduce FIRST in staging on synthetic data — no repro, no fix.
2. Identify which constitutional law the bug violates (data class,
   enforcement layer, audit, fence, perf budget) — the law names the fix.
3. Fix via the CHANGE playbook; the repro becomes the mandatory
   regression test.
4. Reply in the originating Slack thread with: root-cause one-liner, PR
   link, recording. Log to PILOT-TELEMETRY.

## 4. INCIDENT (Tier-1)

Pairs with the incident-responder skill. Stabilize per the pre-agreed
rollback criteria (never debate them mid-incident) → follow the app
RUNBOOK's incident play → gather evidence by X-Request-ID → fix via
CHANGE in staging → security-reviewer battery → deploy (platform-rooted
cause → SECURITY-WAVE) → blameless postmortem ≤5 days with actions
tracked to closure → telemetry append. Prod mutations are human-only.

## 5. SECURITY-WAVE (platform security fix)

Trigger: a security-relevant fix merged under platform/**.
1. Platform suite green + security-reviewer battery on the platform
   packages.
2. FastLane canary 30–60 min: watch queue p95, audit_write_fail_total,
   error rate. Clean → proceed; dirty → halt + roll back the canary.
3. All apps rebuild + redeploy, EACH gated on its own smoke suite.
4. Clear stale-platform markers; note the wave in SIEM + PILOT-TELEMETRY.
Never mixed with feature releases; security scans never path-filtered.

## 6. FORK-REVIEW (evidence-gated decisions)

Trigger: an OPEN-QUESTIONS review date arrived (RefundLens fork at 4
weeks; license-audit results; any trigger check).
1. Pull the pre-agreed evidence (fork_report output, license-audit doc,
   pilot telemetry) — the threshold was set when the fork was opened.
2. Threshold met → draft the decision ADR + update OPEN-QUESTIONS with
   evidence links; notify the owner. DO NOT execute the decision —
   decisions are human; the door map decides who.
3. Threshold not met → extend with a new dated review, or close with the
   evidence recorded. Either way the entry ends this session dated and
   owned — never silent.

## 7. ADR (any architectural decision)

Number = next in creation order (docs/adr/). Structure, all five sections:
Context — the forces and constraints that make this a decision NOW.
Options — at least two real alternatives, each argued at full strength.
Decision — one, stated plainly.
Tradeoffs — the rejected alternative's cost is MANDATORY content.
Consequences — what becomes easier, what becomes harder, what this
forecloses. Immutable once merged; amend only by a new ADR that
references its predecessor.

## 8. KEEPER (scheduled weekly)

Run the keeper skill's WEEKLY block verbatim: patch bumps → suites +
gates + template-smoke → stale-platform markers + OPEN-QUESTIONS dates →
PILOT-TELEMETRY append. Month-end sessions additionally run the
MONTH-END block (fastlane PITR drill); quarterly sessions run the
QUARTERLY block (mock audit on 10 random PRs + dependency-risk review).

## 9. FLAGS-MIGRATION (conditional on the flags trigger — dormant)

Read apps/flags/docs/ (stay-decision, demo results, exit design). Verify
OPEN-QUESTIONS#flags-trigger has FIRED and the ADR amendment exists — if
not, stop. Execute the migration law (§3.4 §4): export from the PA store,
dual-read shim behind the FeatureFlags interface, then fan out managed
Devins — one session per service repo, one PR each, swapping to the
scaffold's eval SDK with local-mode caching enabled. Each PR: contract
test proving flag reads succeed with the eval API unreachable. Old PA
panel → read-only banner. Docs duty: update the migration ADR with
actuals; RUNBOOK gains an eval-API-outage procedure.
