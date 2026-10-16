import type { Db } from "./kill.js";
import { KILL_LOCK } from "./kill.js";
import type { ShadowDecision } from "./engine.js";

/** Every shadow decision logs: inputs, pack version, fired rule, confidence,
    would-be decision + reason code. Serialize against the kill switch via the
    shared advisory lock: a decision landing during engagement inserts already
    frozen (never slips through unfrozen), then mirrors to FastLane's audit
    via the ADR-0015 outbox. */
export async function record(db: Db, d: ShadowDecision): Promise<ShadowDecision> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock($1)", [KILL_LOCK]);
    const killed = (await db.query(
      `SELECT value FROM engine_state WHERE key='kill_switch'`)).rows[0]?.value === true;
    const { rows } = await db.query(
      `INSERT INTO shadow_decisions
         (case_id, signal_version, inputs, pack_id, pack_version, fired_rule,
          decision, reason_code, confidence, rung, frozen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SHADOW',$10) RETURNING id`,
      [d.case_id, d.signal_version, JSON.stringify(d.inputs), d.pack_id,
       d.pack_version, d.fired_rule, d.decision, d.reason_code, d.confidence, killed]);
    await db.query(
      `INSERT INTO decision_outbox (decision_id, payload) VALUES ($1,$2)`,
      [rows[0].id, JSON.stringify({ event: "shadow_decision", ...d, frozen: killed })]);
    await db.query("COMMIT");
    return d;
  } catch (e) { await db.query("ROLLBACK"); throw e; }
}

/** Human-outcome snapshots (permitted FastLane API contract): the daily
    report counts disagreements explicitly; cases without a human decision
    report as `missing`, never as agreement. */
export async function recordHumanOutcome(db: Db, caseId: string, outcome: string, reason?: string) {
  await db.query(
    `INSERT INTO human_outcomes (case_id, outcome, reason) VALUES ($1,$2,$3)
     ON CONFLICT (case_id) DO UPDATE SET outcome=$2, reason=$3`,
    [caseId, outcome, reason ?? null]);
}

export async function dailyReport(db: Db, day: string) {
  const rows = (await db.query(
    `SELECT decision, reason_code, count(*)::int n, avg(confidence)::float conf_avg
     FROM shadow_decisions
     WHERE (created_at AT TIME ZONE 'UTC')::date = $1::date
     GROUP BY decision, reason_code ORDER BY decision, reason_code`, [day])).rows;
  const dist = (await db.query(
    `SELECT width_bucket(confidence, 0, 1, 10) b, count(*)::int n
     FROM shadow_decisions
     WHERE (created_at AT TIME ZONE 'UTC')::date = $1::date GROUP BY b ORDER BY b`, [day])).rows;
  const disagreement = (await db.query(
    `SELECT
       count(*) FILTER (WHERE h.case_id IS NULL)::int AS missing_human,
       count(*) FILTER (WHERE h.case_id IS NOT NULL AND s.decision <> h.outcome)::int AS disagreements,
       count(*) FILTER (WHERE h.case_id IS NOT NULL AND s.decision = h.outcome)::int AS agreements
     FROM shadow_decisions s
     LEFT JOIN human_outcomes h ON h.case_id = s.case_id
     WHERE (s.created_at AT TIME ZONE 'UTC')::date = $1::date`, [day])).rows[0];
  const perRule = (await db.query(
    `SELECT s.fired_rule, s.decision engine_decision, h.outcome human_outcome, count(*)::int n
     FROM shadow_decisions s JOIN human_outcomes h ON h.case_id = s.case_id
       AND s.decision <> h.outcome
     WHERE (s.created_at AT TIME ZONE 'UTC')::date = $1::date
     GROUP BY s.fired_rule, s.decision, h.outcome`, [day])).rows;
  const report = { day, rung: "SHADOW", by_outcome: rows,
    confidence_histogram: dist, human_comparison: disagreement,
    per_rule_disagreements: perRule };
  await db.query(
    `INSERT INTO daily_reports (day, report) VALUES ($1,$2)
     ON CONFLICT (day) DO UPDATE SET report = $2`, [day, JSON.stringify(report)]);
  return report;
}
