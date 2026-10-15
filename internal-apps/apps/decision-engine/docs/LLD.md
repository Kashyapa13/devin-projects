# decision-engine — LLD

## case_signals v1 (versioned contract)
`{signal_version:1, case_id, risk_score, doc_verification, country_tier,
watchlist_hits, tenure_days, velocity, ml_scores[{model_name,model_version,
score,score_type}]}` — unknown major → 400 SIGNAL_VERSION, never guessing.

## Endpoints (api/registry)
POST /api/v1/engine/decide — shadow evaluate + record · POST kill-switch /
kill-switch/release · GET reports/daily?day= · GET stale-packs · healthz/readyz.

## Feature Catalog
| Feature | Status | Evidence |
| --- | --- | --- |
| Shadow engine (signals→packs→decision_db) | **built — this PR** | tests/engine.test.ts 8/8; golden set 220/220 |
| Kill switch | **built** | drill test: frozen in-flight + all-human 503 |
| Daily report | **built** | `daily_reports` rollup endpoint |
| ASSIST rung | later ADR on measured data | — |

## Schema (commentary — db/migrations is truth)

- `shadow_decisions` — one row per shadow decision: case_id, signal_version, inputs (jsonb, full case_signals v1), pack_id + pack_version (strategy version → AML trail), fired_rule, decision, reason_code, confidence, rung, frozen, created_at. Index `shadow_decisions_case_idx` on (case_id, created_at desc).
- `engine_state` — key/value engine flags; `kill_switch` row flips the decide path to 503 all-human and freezes in-flight rows.
- `daily_reports` — one row per day: rollup jsonb (decisions by band, confidence histogram, per-rule disagreement counts).
