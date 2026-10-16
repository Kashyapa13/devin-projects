/**
 * Minimal client interface: a pg PoolClient / transaction handle, or any
 * object that runs parameterized SQL. The caller owns BEGIN/COMMIT —
 * audit writes execute on this same handle, inside the same transaction.
 */
export interface Queryable {
  query(text: string, params?: readonly unknown[]): Promise<unknown>;
}

/** One audit event. `detail` must never carry C4 payloads (constitution). */
export interface AuditEvent {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: Record<string, unknown>;
  reqId?: string;
  at?: Date;
}

export const AUDIT_TABLE = "audit_events";

const INSERT_SQL = `INSERT INTO ${AUDIT_TABLE} (actor, action, entity, entity_id, detail, req_id, at)
VALUES ($1, $2, $3, $4, $5, $6, $7)`;

/**
 * Append one row to audit_events on the given transaction handle.
 * Call it inside the same transaction as the state change — if the
 * transaction rolls back, both state change and audit row vanish
 * together. There is intentionally no update/delete API: audit_events
 * is append-only.
 */
export async function auditWriter(
  tx: Queryable,
  event: AuditEvent,
): Promise<void> {
  await tx.query(INSERT_SQL, [
    event.actor,
    event.action,
    event.entity,
    event.entityId,
    JSON.stringify(event.detail ?? {}),
    event.reqId ?? null,
    event.at ?? new Date(),
  ]);
}

/**
 * Run `work` and write `event` on the same handle. Any throw — from the
 * state change or the audit write — propagates so the caller's
 * transaction aborts as one unit. No partial success is possible.
 */
export async function audited<T>(
  tx: Queryable,
  work: (tx: Queryable) => Promise<T>,
  event: (result: T) => AuditEvent,
): Promise<T> {
  const result = await work(tx);
  await auditWriter(tx, event(result));
  return result;
}

/** SIEM-ready JSON-lines serialization — one line per row. */
export interface AuditRow extends AuditEvent {
  id?: number | string;
}

export function toSiemLine(row: AuditRow): string {
  return JSON.stringify({
    id: row.id ?? null,
    at: (row.at ?? new Date()).toISOString(),
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entity_id: row.entityId,
    req_id: row.reqId ?? null,
    detail: row.detail ?? {},
  });
}

export function toSiemLines(rows: Iterable<AuditRow>): string {
  return [...rows].map(toSiemLine).join("\n");
}
