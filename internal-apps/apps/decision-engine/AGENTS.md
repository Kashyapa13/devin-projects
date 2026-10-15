# decision-engine — AGENTS.md

Tier-2 · C2 signals in / decisions out (no C4 — engine reads signals, not PII) · own `decision_db` · SHADOW rung only (ADR-0018).

Start here: root AGENTS.md → this file → docs/HLD.md → docs/LLD.md → docs/OPEN-QUESTIONS.md → plan.

## Non-negotiables
- SHADOW rung ONLY — the engine decides nothing in reality; every case stays human until a promotion ADR on measured data.
- Strategy writer of record: **Vaibhav**. Threshold changes = PR + writer review; pack changes = ADR; pack stale >90d → alert.
- Deterministic core only — rule evaluation over `case_signals` v1; LLM only upstream for doc signal extraction, never in the decision path.
- Every decision row carries inputs + pack version + fired rule + confidence + reason, mirrored to FastLane's audit via the ADR-0018 API-only contract.
- Kill switch is sacred: one click → all-human + in-flight frozen.

## Layout
`api/src/{server,engine,signals,providers,store,kill}.ts` · `strategies/packs.ts` (5 seed packs, declared precedence) · `db/migrations/` · `tests/` (pack suite, golden set 220, kill-switch drill) · `tests/golden/cases.json`.

## Stop-conditions (in addition to root)
Any change weakening the golden-set gate · real ML score wired without replacing MockModelScoreProvider behind the interface · ASSIST/AUTO rung work without the measured-data ADR.
