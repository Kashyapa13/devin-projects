/** One-click kill switch (ADR-0015): every case → humans; in-flight
    auto-decisions frozen for supervisor review. */
const LOCK = 420001; // shared advisory lock serializing record() vs engagement

export async function setKillSwitch(db: Db, on: boolean) {
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    await db.query(
      `INSERT INTO engine_state (key,value) VALUES ('kill_switch',$1)
       ON CONFLICT (key) DO UPDATE SET value = $1`, [JSON.stringify(on)]);
    if (on)
      await db.query(`UPDATE shadow_decisions SET frozen = true WHERE frozen = false`);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }
}
export async function isKilled(db: Db): Promise<boolean> {
  const { rows } = await db.query(`SELECT value FROM engine_state WHERE key='kill_switch'`);
  return rows[0]?.value === true;
}
export { LOCK as KILL_LOCK };
export interface Db { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }
