# decision-engine — HLD (ADR-0015)

New app, own deployment unit + own `decision_db`. API-only integration with
FastLane (reads case signals, mirrors audit rows — authorized by ADR-0015).

Pipeline (SHADOW): pull PENDING/IN_REVIEW kyc_cases → map to case_signals v1
(+ MockModelScoreProvider ml_scores) → `evaluate()` across packs in declared
precedence (escalate > anomaly > approve > default, first-match wins) →
INSERT shadow_decisions (inputs + pack@version + fired rule + confidence +
reason) → mirror audit event → daily_report rollup.

Rung ladder: SHADOW (now) → ASSIST → AUTO (each promotion = measured data +
new ADR; AUTO has no auto-reject).

Guardrails: kill switch (engine_state.flip → decide 503s + in-flight frozen)
· daily report (outcomes by band + confidence histogram) · stale-pack alert
(>90d) · golden set 220 in CI (any silent flip = red).
