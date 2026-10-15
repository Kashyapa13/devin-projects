import type { Db } from "./kill.js";
import type { ShadowDecision } from "./engine.js";

/** Every shadow decision logs: inputs, pack version, fired rule, confidence,
    would-be decision + reason code — and mirrors to FastLane's audit via the
    ADR-0018 API-only contract. */
export async function record(db: Db, d: ShadowDecision) {
  await db.query(
    `INSERT INTO shadow_decisions
       (case_id, signal_version, inputs, pack_id, pack_version, fired_rule,
        decision, reason_code, confidence, rung)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SHADOW')`,
    [d.case_id, d.signal_version, JSON.stringify(d.inputs), d.pack_id,
     d.pack_version, d.fired_rule, d.decision, d.reason_code, d.confidence]);
}

export async function dailyReport(db: Db, day: string) {
  const { rows } = await db.query(
    `SELECT decision, reason_code, count(*)::int n, avg(confidence)::float conf_avg
     FROM shadow_decisions WHERE created_at::date = $1
     GROUP BY decision, reason_code ORDER BY decision, reason_code`, [day]);
  const dist = await db.query(
    `SELECT width_bucket(confidence, 0, 1, 10) b, count(*)::int n
     FROM shadow_decisions WHERE created_at::date = $1 GROUP BY b ORDER BY b`, [day]);
  const report = { day, rung: "SHADOW", by_outcome: rows,
    confidence_histogram: dist.rows };
  await db.query(
    `INSERT INTO daily_reports (day, report) VALUES ($1,$2)
     ON CONFLICT (day) DO UPDATE SET report = $2`, [day, JSON.stringify(report)]);
  return report;
}
