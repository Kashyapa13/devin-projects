# Flags — AGENTS.md (stay-decision + capability demo + dormant exit design)

Status: STAY on Power Apps per ADR-0002 — production continues on the
existing panel; no migration and no vendor bake-off is in scope. This
engagement evaluates Devin vs Power Apps; the panel is not broken enough
to justify any change today. This repo holds: (1) the stay-decision
record, (2) the pilot's capability-demo spec (a Devin-built replica
measured against the PA original), (3) the dormant exit design (the
Devin-built system we would build IF the flags trigger fires).

## 1. The capability demo (pilot scope — production unchanged)
The replica demonstrates, against the live PA panel as baseline: CRUD +
env scoping (dev/staging/prod) + typed-confirm deletes + full audit
(actor/action/timestamp on every change) + RBAC (flag_editor non-prod,
flag_admin prod) + the runtime eval API — GET /api/flags/evaluate?key=&
userId= with deterministic hash bucketing (same userId+key = same result),
cached, <50ms local, stale-while-revalidate + a /demo page where a flip
visibly changes UI. Deployed demo-grade: synthetic flags only,
demo-tier deploy. Labeled on every surface: "capability demo —
production continues on Power Apps."
The replica doubles as the honest cost measurement: it shows exactly what
we would own (SDK versioning for ~60 services, a 99.95% runtime SLA,
on-call) — the bar any migration must justify.

## 2. The dormant exit design (Devin-built — the only alternative path in scope)
If the trigger fires, the build target is: flags / flag_env_overrides /
flag_targeting(rules jsonb) / audit_events on platform patterns; eval API
99.95% multi-AZ (runtime dependency of ~60 services); SSE push with poll
fallback (SSE wins on kill-switch latency — the promise that matters);
local-mode SDK caching (last-known state, never crash); panel flip ≤10s,
propagation ≤5s. First PR is an ADR amendment, nothing else. Eval API
contract changes = ADR + platform review, always.

## 3. The flags trigger (two-way door, pre-agreed)
Migrate to the exit design ONLY IF: (a) the pilot replica demonstrates a
clear capability/run-cost advantage over the PA panel, AND (b) the license
audit (OPEN-1) shows Premium spend growing with headcount. Both, not
either. Until then: any flag-system build beyond the labeled demo =
rejected PR.

## 4. Migration law (dormant — executes only on trigger)
T-0  export from the PA store → scaffold import format.
T+1  dual-read shim behind the FeatureFlags interface — THE only legal
     integration point; rollback = shim config, no deploys.
T+2  SDK waves: ~60 service repos in batches of 10 via managed Devins, one
     PR each, every PR carrying the eval-down contract test (reads succeed
     with the eval API unreachable, local-mode cache). Wave deps
     pre-approved by the migration ADR; every wave PR cites it.
T+3  14-day divergence monitoring (flags_shim_divergence_total; any
     divergence = page + batch halt).
T+4  PA panel → read-only banner; retire at day 30 clean.
Shim removal: separate release, ≥2 releases after the last wave, never
same-release.

## 5. Shim law
Interface: isEnabled(key, ctx) / variation(key, ctx, default) / allFlags(ctx).
The shim TRANSLATES, it never INVENTS: no new flag semantics, no caching
policy beyond the documented local-mode TTL (60s, jittered ±10%). Services
calling anything but the shim = rejected PR.

## 6. Forbidden
Improvements to the PA panel beyond normal ops (it is staying) · any
vendor SDK or vendor-evaluation artifact (out of scope by ADR-0002) ·
semantics in the shim · removing the shim early · building the exit
design before the trigger + ADR amendment both exist · unlabeling the demo.

## 7. Devin session protocol
START: root AGENTS.md → this file (already in your context) →
docs/stay-decision.md → docs/demo-spec.md → OPEN-QUESTIONS#flags-trigger
(verify it is still closed before ANY build-shaped request beyond the
labeled demo). STOP-CONDITIONS: any request that builds flag-system
functionality beyond the labeled demo; any vendor SDK or vendor-comparison
request; shim semantics; unlabeling the demo.
