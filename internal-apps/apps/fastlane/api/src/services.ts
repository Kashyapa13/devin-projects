import { auditWriter } from "@company/audit";
import { ApiError } from "@company/http";
import type { FieldCipher } from "@company/crypto";
import { canTransition, type Status } from "./statemachine.js";

export interface Queryable {
  query(text: string, params?: readonly unknown[]): Promise<unknown>;
}
export interface TxQueryable extends Queryable {
  connect?(): Promise<never>;
}

/** Run `fn` on a single transactional handle (BEGIN/COMMIT/ROLLBACK). */
export async function withTx<T>(
  db: Queryable,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  await db.query("BEGIN");
  try {
    const out = await fn(db);
    await db.query("COMMIT");
    return out;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

export interface Deps {
  db: Queryable;
  cipher: FieldCipher;
}

interface Row {
  rows: Record<string, unknown>[];
}
const rows = (r: unknown): Record<string, unknown>[] =>
  (r as Row).rows ?? [];

const MASKED_COLS =
  "id, customer_ref, country, risk_score, doc_type, status, priority, " +
  "assignee_id, sla_due_at, version, created_at, updated_at";

async function lockCase(
  tx: Queryable,
  id: string,
): Promise<Record<string, unknown>> {
  const res = rows(
    await tx.query(`SELECT * FROM kyc_cases WHERE id = $1 FOR UPDATE`, [id]),
  );
  const kase = res[0];
  if (!kase) throw new ApiError("NOT_FOUND", "case not found", 404);
  return kase;
}

export interface Actor {
  sub: string;
  roles: string[];
}

/** A decision: guard (pure) → state change → audit row, ONE transaction. */
export async function transition(
  deps: Deps,
  caseId: string,
  to: Status,
  actor: Actor,
  opts: {
    reason?: string | undefined;
    reqId?: string | undefined;
    version?: number | undefined;
  },
): Promise<Record<string, unknown>> {
  return withTx(deps.db, async (tx) => {
    const kase = await lockCase(tx, caseId);
    if (
      opts.version !== undefined &&
      kase.version !== opts.version
    ) {
      throw new ApiError(
        "STALE_VERSION",
        "the case changed since you loaded it — refresh and try again",
        409,
      );
    }
    const verdict = canTransition({
      from: kase.status as Status,
      to,
      actor,
      assigneeId: (kase.assignee_id as string | null) ?? null,
      reason: opts.reason,
    });
    const res = rows(
      await tx.query(
        `UPDATE kyc_cases
         SET status = $2,
             assignee_id = CASE WHEN $3 THEN $4 ELSE assignee_id END,
             version = version + 1,
             updated_at = now()
         WHERE id = $1
         RETURNING ${MASKED_COLS}`,
        [caseId, to, verdict.assigns, actor.sub],
      ),
    );
    await auditWriter(tx, {
      actor: actor.sub,
      action: `case.${to.toLowerCase()}`,
      entity: "kyc_case",
      entityId: caseId,
      detail: {
        from: kase.status,
        to,
        ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
      },
      reqId: opts.reqId ?? "",
    });
    return res[0]!;
  });
}

export async function addNote(
  deps: Deps,
  caseId: string,
  actor: Actor,
  body: string,
  reqId: string,
): Promise<Record<string, unknown>> {
  const trimmed = body.trim();
  if (trimmed.length < 1) {
    throw new ApiError("VALIDATION", "note body is empty", 400);
  }
  return withTx(deps.db, async (tx) => {
    await lockCase(tx, caseId);
    const res = rows(
      await tx.query(
        `INSERT INTO case_notes (case_id, author_id, body)
         VALUES ($1, $2, $3) RETURNING *`,
        [caseId, actor.sub, trimmed],
      ),
    );
    await auditWriter(tx, {
      actor: actor.sub,
      action: "case.note",
      entity: "kyc_case",
      entityId: caseId,
      detail: { note_id: res[0]!.id },
      reqId,
    });
    return res[0]!;
  });
}

/**
 * Audited PII reveal — the audit row is written FIRST (autocommitted)
 * and only then is the ciphertext decrypted and returned. A crash
 * after the write still leaves the reveal on record: write-ahead.
 * UI-unmask without this row = P1 incident (AGENTS.md §5).
 */
export async function reveal(
  deps: Deps,
  caseId: string,
  actor: Actor,
  reqId: string,
): Promise<{ legal_name: string }> {
  await auditWriter(deps.db, {
    actor: actor.sub,
    action: "case.reveal",
    entity: "kyc_case",
    entityId: caseId,
    detail: {},
    reqId,
  });
  const res = rows(
    await deps.db.query(
      `SELECT legal_name_enc FROM kyc_cases WHERE id = $1`,
      [caseId],
    ),
  );
  const enc = res[0]?.legal_name_enc;
  if (typeof enc !== "string") {
    throw new ApiError("NOT_FOUND", "case not found or has no C4 field", 404);
  }
  return { legal_name: await deps.cipher.decrypt(enc) };
}

/**
 * Issue a doc URL — signed-shape (15-min expiry, never bytes through the
 * API, ADR-0007). The real S3 signer wires at deploy via S3_SIGNER_KMS;
 * the audit trail of issuance is enforced here today.
 */
export async function docUrl(
  deps: Deps,
  caseId: string,
  actor: Actor,
  reqId: string,
): Promise<{ url: string; expires_at: string }> {
  await auditWriter(deps.db, {
    actor: actor.sub,
    action: "case.doc_url",
    entity: "kyc_case",
    entityId: caseId,
    detail: { ttl_seconds: 900 },
    reqId,
  });
  const exp = new Date(Date.now() + 900_000);
  const bucket = process.env.DOC_BUCKET ?? "docs.local";
  return {
    url: `https://${bucket}/kyc/${encodeURIComponent(caseId)}?expires=${exp.toISOString()}&sig=dev`,
    expires_at: exp.toISOString(),
  };
}

const TAB_WHERE: Record<string, string> = {
  mine: "status = 'IN_REVIEW' AND assignee_id = $u",
  team: "status IN ('PENDING','IN_REVIEW','ESCALATED')",
  breaching:
    "status IN ('PENDING','IN_REVIEW','ESCALATED') AND sla_due_at < now()",
};

/**
 * Keyset (cursor) pagination on (sla_due_at, id) — OFFSET races on a
 * mutating queue (constitution law; platform-db paginate covers the
 * unfiltered case, the queue needs the tab filter so the clause is
 * inline with the same >cursor/limit+1 pattern).
 */
export async function listQueue(
  deps: Deps,
  opts: {
    tab: string;
    cursor?: string | undefined;
    limit: number;
    actor: Actor;
  },
): Promise<{ rows: Record<string, unknown>[]; next_cursor?: string }> {
  const where = TAB_WHERE[opts.tab];
  if (!where) {
    throw new ApiError("VALIDATION", `unknown queue tab "${opts.tab}"`, 400);
  }
  const params: unknown[] = [];
  let cond = where;
  if (cond.includes("$u")) {
    params.push(opts.actor.sub);
    cond = cond.replace("$u", `$${params.length}`);
  }
  const conds: string[] = [cond];
  if (opts.cursor) {
    const [epoch, id] = Buffer.from(opts.cursor, "base64url")
      .toString()
      .split("|");
    params.push(Number(epoch), id);
    conds.push(
      `(extract(epoch from sla_due_at), id) > ($${params.length - 1}::numeric, $${params.length}::uuid)`,
    );
  }
  params.push(opts.limit + 1);
  const res = rows(
    await deps.db.query(
      `SELECT ${MASKED_COLS}, extract(epoch from sla_due_at) AS sla_epoch
       FROM kyc_cases
       WHERE ${conds.join(" AND ")}
       ORDER BY sla_due_at ASC, id ASC
       LIMIT $${params.length}`,
      params,
    ),
  );
  const page = res.slice(0, opts.limit);
  const last = page[page.length - 1];
  const out: { rows: typeof page; next_cursor?: string } = { rows: page };
  if (res.length > opts.limit && last) {
    // epoch keeps microsecond precision — ISO/Date would truncate to ms and
    // re-emit the boundary row.
    out.next_cursor = Buffer.from(`${last.sla_epoch}|${last.id}`).toString(
      "base64url",
    );
  }
  return out;
}

export async function getCase(
  deps: Deps,
  id: string,
): Promise<Record<string, unknown>> {
  const res = rows(
    await deps.db.query(`SELECT ${MASKED_COLS} FROM kyc_cases WHERE id = $1`, [
      id,
    ]),
  );
  const kase = res[0];
  if (!kase) throw new ApiError("NOT_FOUND", "case not found", 404);
  return kase;
}

export async function caseAudit(
  deps: Deps,
  caseId: string,
): Promise<Record<string, unknown>[]> {
  return rows(
    await deps.db.query(
      `SELECT actor, action, entity, entity_id, detail, req_id, at
       FROM audit_events WHERE entity_id = $1 ORDER BY id`,
      [caseId],
    ),
  );
}

export async function allAudit(deps: Deps): Promise<Record<string, unknown>[]> {
  return rows(
    await deps.db.query(
      `SELECT id, actor, action, entity, entity_id, detail, req_id, at
       FROM audit_events ORDER BY id DESC LIMIT 500`,
    ),
  );
}

export async function slaDigest(
  deps: Deps,
): Promise<{ breaching: number; by_status: Record<string, number> }> {
  const res = rows(
    await deps.db.query(
      `SELECT status, COUNT(*)::int AS n FROM kyc_cases
       WHERE status IN ('PENDING','IN_REVIEW','ESCALATED') AND sla_due_at < now()
       GROUP BY status`,
    ),
  );
  const byStatus: Record<string, number> = {};
  let breaching = 0;
  for (const r of res) {
    byStatus[String(r.status)] = Number(r.n);
    breaching += Number(r.n);
  }
  return { breaching, by_status: byStatus };
}
