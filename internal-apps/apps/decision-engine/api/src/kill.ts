/** One-click kill switch (ADR-0018): every case → humans; in-flight
    auto-decisions frozen for supervisor review. */
export async function setKillSwitch(db: Db, on: boolean) {
  await db.query(
    `INSERT INTO engine_state (key,value) VALUES ('kill_switch',$1)
     ON CONFLICT (key) DO UPDATE SET value = $1`, [JSON.stringify(on)]);
  if (on)
    await db.query(`UPDATE shadow_decisions SET frozen = true WHERE frozen = false`);
}
export async function isKilled(db: Db): Promise<boolean> {
  const { rows } = await db.query(`SELECT value FROM engine_state WHERE key='kill_switch'`);
  return rows[0]?.value === true;
}
export interface Db { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }
