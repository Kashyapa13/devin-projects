# @company/audit

Append-only audit writer. The audit row lands in the **same transaction**
as the state change — both commit or neither does.

## API

- `auditWriter(tx: Queryable, event: AuditEvent)` — one `INSERT INTO
  audit_events` on the caller's transaction handle.
- `audited(tx, work, event)` — run `work(tx)` then write the audit row on
  the same handle; any failure propagates so the tx aborts as one unit.
- `toSiemLine(row)` / `toSiemLines(rows)` — SIEM-ready JSON-lines export.
- `Queryable` — `{ query(text, params) }`; a `pg` PoolClient satisfies it.
- `AuditEvent` — `{actor, action, entity, entityId, detail?, reqId?, at?}`.
  `detail` must never carry C4 payloads.

## Usage

```ts
await db.transaction(async (tx) => {
  await audited(
    tx,
    async (t) => {
      const id = await claimCase(t, caseId);
      return id;
    },
    (id) => ({ actor: req.user.sub, action: "case.claim", entity: "case", entityId: id, reqId: req.id }),
  );
});
```

No `update`/`delete` exports exist — `audit_events` is append-only by
construction. Kill-test in `tests/` proves a crash mid-action leaves no
orphan state and no audit row.

Expected table (create it in the app's own migrations):

```sql
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  req_id TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
