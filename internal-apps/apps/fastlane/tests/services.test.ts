import { beforeEach, describe, expect, it } from "vitest";
import type { FieldCipher } from "@company/crypto";
import * as svc from "../api/src/services.js";

/**
 * Service-layer unit tests against a scripted Queryable — every branch of
 * the SQL-facing logic without a live database (integration coverage
 * lives in routes.test.ts / routes-edge.test.ts).
 */

interface Call {
  text: string;
  params: readonly unknown[] | undefined;
}
let calls: Call[] = [];
let answers: { match: RegExp; rows: Record<string, unknown>[]; throw?: Error }[] = [];

const stubDb = (): svc.Queryable => ({
  query: async (text: string, params?: readonly unknown[]) => {
    calls.push({ text, params });
    for (const a of answers) {
      if (a.match.test(text)) {
        if (a.throw) throw a.throw;
        return { rows: a.rows };
      }
    }
    return { rows: [] };
  },
});
const fakeCipher = (over: Partial<FieldCipher> = {}): FieldCipher => ({
  keyId: "k",
  encrypt: async () => "enc",
  decrypt: async () => "SYNTH-ENTITY-0000",
  rotateTo: () => {},
  ...over,
});
const deps = (cipher?: FieldCipher): svc.Deps => ({
  db: stubDb(),
  cipher: cipher ?? fakeCipher(),
});
const actor = { sub: "11111111-1111-1111-1111-111111111111", roles: ["reviewer"] };
const sup = { sub: "22222222-2222-2222-2222-222222222222", roles: ["supervisor"] };
const CASE = "84bd3fb3-a57b-4029-bab7-73a75a196451";
const caseRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: CASE,
  customer_ref: "CUST-1000",
  status: "PENDING",
  assignee_id: null,
  version: 1,
  sla_due_at: new Date().toISOString(),
  ...over,
});
const sql = (re: RegExp) => calls.filter((c) => re.test(c.text));
const begin = () => sql(/^BEGIN$/).length;
const commits = () => sql(/^COMMIT$/).length;
const rollbacks = () => sql(/^ROLLBACK$/).length;

beforeEach(() => {
  calls = [];
  answers = [];
});

describe("withTx — one handle, one fate", () => {
  it("commits the work on success", async () => {
    const out = await svc.withTx(deps().db, async () => "done");
    expect(out).toBe("done");
    expect(begin()).toBe(1);
    expect(commits()).toBe(1);
    expect(rollbacks()).toBe(0);
  });
  it("rolls back and rethrows on failure — no partial state", async () => {
    await expect(
      svc.withTx(deps().db, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(rollbacks()).toBe(1);
    expect(commits()).toBe(0);
  });
});

describe("listQueue — tabs, keyset cursor, limit contract", () => {
  it("rejects an unknown tab with 400 VALIDATION before any SQL", async () => {
    await expect(
      svc.listQueue(deps(), { tab: "everything", limit: 25, actor }),
    ).rejects.toMatchObject({ code: "VALIDATION", statusCode: 400 });
    expect(calls.length).toBe(0);
  });
  for (const tab of ["mine", "team", "breaching"]) {
    it(`tab=${tab} issues its WHERE clause with limit+1`, async () => {
      await svc.listQueue(deps(), { tab, limit: 25, actor });
      const q = sql(/FROM kyc_cases/)[0]!;
      expect(q.text).toContain("LIMIT $");
      expect(q.params!.at(-1)).toBe(26);
    });
  }
  it("mine binds the actor sub ($u → positional param)", async () => {
    await svc.listQueue(deps(), { tab: "mine", limit: 25, actor });
    const q = sql(/FROM kyc_cases/)[0]!;
    expect(q.text).toContain("assignee_id = $1");
    expect(q.params![0]).toBe(actor.sub);
  });
  it("team/breaching bind no actor param — only the limit", async () => {
    await svc.listQueue(deps(), { tab: "team", limit: 10, actor });
    expect(sql(/FROM kyc_cases/)[0]!.params).toEqual([11]);
    await svc.listQueue(deps(), { tab: "breaching", limit: 10, actor });
    expect(sql(/FROM kyc_cases/)[1]!.params).toEqual([11]);
    expect(sql(/FROM kyc_cases/)[1]!.text).toContain("sla_due_at < now()");
  });
  it("a valid cursor binds (epoch, uuid) after the tab params", async () => {
    const cursor = Buffer.from(`1700000000.5|${CASE}`).toString("base64url");
    await svc.listQueue(deps(), { tab: "team", limit: 25, actor, cursor });
    const q = sql(/FROM kyc_cases/)[0]!;
    expect(q.text).toContain("> ($1::numeric, $2::uuid)");
    expect(q.params).toEqual([1700000000.5, CASE, 26]);
  });
  it("rejects malformed cursors with 400 VALIDATION — never a silent empty page", async () => {
    for (const bad of [
      "not-base64!!!",
      Buffer.from("1700000000").toString("base64url"), // no id
      Buffer.from(`abc|${CASE}`).toString("base64url"), // NaN epoch
      Buffer.from("1700000000|not-a-uuid").toString("base64url"),
      Buffer.from(`1700000000|${CASE}|extra`).toString("base64url"),
    ]) {
      calls = [];
      await expect(
        svc.listQueue(deps(), { tab: "team", limit: 25, actor, cursor: bad }),
      ).rejects.toMatchObject({ code: "VALIDATION", statusCode: 400 });
    }
  });
  // LIMIT boundary values: the SQL parameter is always limit+1.
  for (const [limit, sqlParam] of [
    [1, 2],
    [499, 500],
    [500, 501],
    [5001, 5002],
  ] as const) {
    it(`limit=${limit} issues LIMIT ${sqlParam} (limit+1 lookahead)`, async () => {
      await svc.listQueue(deps(), { tab: "team", limit, actor });
      expect(sql(/FROM kyc_cases/)[0]!.params!.at(-1)).toBe(sqlParam);
    });
  }
  it("emits next_cursor only when the lookahead row exists", async () => {
    const mk = (i: number) => ({
      id: `84bd3fb3-a57b-4029-bab7-73a75a19645${i}`,
      sla_epoch: `170000000${i}.0`,
    });
    answers = [{ match: /FROM kyc_cases/, rows: [mk(1), mk(2), mk(3)] }];
    const full = await svc.listQueue(deps(), { tab: "team", limit: 2, actor });
    expect(full.rows.length).toBe(2);
    expect(full.next_cursor).toBeTruthy();
    const decoded = Buffer.from(full.next_cursor!, "base64url").toString();
    expect(decoded).toBe("1700000002.0|84bd3fb3-a57b-4029-bab7-73a75a196452");
    answers = [{ match: /FROM kyc_cases/, rows: [mk(3)] }];
    const last = await svc.listQueue(deps(), { tab: "team", limit: 2, actor });
    expect(last.next_cursor).toBeUndefined();
  });
});

describe("transition — guard → state change → audit, one tx", () => {
  it("writes the audit row in the same transaction as the UPDATE", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow()] },
      { match: /UPDATE kyc_cases/, rows: [caseRow({ status: "IN_REVIEW" })] },
    ];
    const out = await svc.transition(deps(), CASE, "IN_REVIEW", actor, { reqId: "r1" });
    expect(out.status).toBe("IN_REVIEW");
    expect(commits()).toBe(1);
    const audit = sql(/INSERT INTO audit_events/)[0]!;
    expect(audit.params![1]).toBe("case.in_review");
    expect(audit.params![3]).toBe(CASE);
    expect(audit.params![5]).toBe("r1");
    expect(JSON.parse(audit.params![4] as string)).toEqual({
      from: "PENDING",
      to: "IN_REVIEW",
    });
  });
  it("binds the actor as assignee on claim edges", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow()] },
      { match: /UPDATE kyc_cases/, rows: [caseRow()] },
    ];
    await svc.transition(deps(), CASE, "IN_REVIEW", actor, {});
    const upd = sql(/UPDATE kyc_cases/)[0]!;
    expect(upd.params![2]).toBe(true); // assigns
    expect(upd.params![3]).toBe(actor.sub);
  });
  it("does not reassign on decision edges", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ status: "IN_REVIEW", assignee_id: actor.sub })] },
      { match: /UPDATE kyc_cases/, rows: [caseRow()] },
    ];
    await svc.transition(deps(), CASE, "APPROVED", actor, {});
    expect(sql(/UPDATE kyc_cases/)[0]!.params![2]).toBe(false);
  });
  it("rejects a stale version with 409 STALE_VERSION before the UPDATE", async () => {
    answers = [{ match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ version: 3 })] }];
    await expect(
      svc.transition(deps(), CASE, "IN_REVIEW", actor, { version: 2 }),
    ).rejects.toMatchObject({ code: "STALE_VERSION", statusCode: 409 });
    expect(sql(/UPDATE kyc_cases/).length).toBe(0);
    expect(rollbacks()).toBe(1);
  });
  it("omits expected_version → no optimistic-lock check", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ version: 9 })] },
      { match: /UPDATE kyc_cases/, rows: [caseRow()] },
    ];
    await svc.transition(deps(), CASE, "IN_REVIEW", actor, {});
    expect(commits()).toBe(1);
  });
  it("reject carries the reason into the audit detail", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ status: "IN_REVIEW", assignee_id: actor.sub })] },
      { match: /UPDATE kyc_cases/, rows: [caseRow()] },
    ];
    await svc.transition(deps(), CASE, "REJECTED", actor, {
      reason: "documents expired and photo unreadable",
    });
    const audit = sql(/INSERT INTO audit_events/)[0]!;
    expect(JSON.parse(audit.params![4] as string)).toEqual({
      from: "IN_REVIEW",
      to: "REJECTED",
      reason: "documents expired and photo unreadable",
    });
  });
  it("a missing case is 404 NOT_FOUND inside the tx (then rolled back)", async () => {
    await expect(
      svc.transition(deps(), CASE, "IN_REVIEW", actor, {}),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
    expect(rollbacks()).toBe(1);
  });
});

describe("addNote — assignee-scoped, audited append", () => {
  it("rejects an empty body with 400 VALIDATION before touching the db", async () => {
    for (const body of ["", "   ", "\n\t "]) {
      await expect(
        svc.addNote(deps(), CASE, actor, body, "r"),
      ).rejects.toMatchObject({ code: "VALIDATION", statusCode: 400 });
    }
    expect(calls.length).toBe(0);
  });
  it("rejects a non-assignee reviewer with 403 NOT_ASSIGNEE, no INSERT", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ status: "IN_REVIEW", assignee_id: OTHER() })] },
    ];
    await expect(svc.addNote(deps(), CASE, actor, "hello", "r")).rejects.toMatchObject({
      code: "NOT_ASSIGNEE",
    });
    expect(sql(/INSERT INTO case_notes/).length).toBe(0);
  });
  it("supervisor bypasses the assignee check (LLD matrix)", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ status: "IN_REVIEW", assignee_id: OTHER() })] },
      { match: /INSERT INTO case_notes/, rows: [{ id: 7 }] },
    ];
    const n = await svc.addNote(deps(), CASE, sup, "note text", "r2");
    expect(n.id).toBe(7);
    const audit = sql(/INSERT INTO audit_events/)[0]!;
    expect(audit.params![1]).toBe("case.note");
    expect(JSON.parse(audit.params![4] as string)).toEqual({ note_id: 7 });
  });
  it("trims the stored body", async () => {
    answers = [
      { match: /SELECT \* FROM kyc_cases/, rows: [caseRow({ assignee_id: actor.sub })] },
      { match: /INSERT INTO case_notes/, rows: [{ id: 1 }] },
    ];
    await svc.addNote(deps(), CASE, actor, "  padded note  ", "r");
    expect(sql(/INSERT INTO case_notes/)[0]!.params![2]).toBe("padded note");
  });
});
function OTHER() {
  return "55555555-5555-5555-5555-555555555555";
}

describe("reveal — write-ahead audit BEFORE the plaintext exists", () => {
  it("missing case or missing C4 field → 404 NOT_FOUND", async () => {
    await expect(svc.reveal(deps(), CASE, actor, "r")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
    answers = [{ match: /FROM kyc_cases/, rows: [{ legal_name_enc: null }] }];
    await expect(svc.reveal(deps(), CASE, actor, "r")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("non-assignee reviewer is denied BEFORE any audit row is minted", async () => {
    answers = [{ match: /FROM kyc_cases/, rows: [{ legal_name_enc: "enc", assignee_id: OTHER() }] }];
    await expect(svc.reveal(deps(), CASE, actor, "r")).rejects.toMatchObject({
      code: "NOT_ASSIGNEE",
      statusCode: 403,
    });
    expect(sql(/audit_events/).length).toBe(0);
  });
  it("writes case.reveal audit before decrypt is called (write-ahead)", async () => {
    answers = [{ match: /FROM kyc_cases/, rows: [{ legal_name_enc: "enc", assignee_id: actor.sub }] }];
    const order: string[] = [];
    const cipher = fakeCipher({
      decrypt: async () => {
        order.push("decrypt");
        return "SYNTH-ENTITY-0000";
      },
    });
    const db = deps(cipher);
    const realQuery = db.db.query.bind(db.db);
    db.db.query = async (t, p) => {
      if (/audit_events/.test(t)) order.push("audit");
      return realQuery(t, p);
    };
    const out = await svc.reveal(db, CASE, actor, "r9");
    expect(out).toEqual({ legal_name: "SYNTH-ENTITY-0000" });
    expect(order).toEqual(["audit", "decrypt"]);
    const audit = sql(/INSERT INTO audit_events/)[0]!;
    expect(audit.params![1]).toBe("case.reveal");
    expect(audit.params![5]).toBe("r9");
  });
});

describe("docUrl — signed, audited, never bytes", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
    delete process.env.DOC_SIGNING_KEY;
    delete process.env.DOC_BUCKET;
    delete process.env.NODE_ENV;
  });
  it("missing case → 404 NOT_FOUND, no audit row", async () => {
    await expect(svc.docUrl(deps(), CASE, actor, "r")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(sql(/audit_events/).length).toBe(0);
  });
  it("non-assignee reviewer denied before the write-ahead audit", async () => {
    answers = [{ match: /FROM kyc_cases/, rows: [{ id: CASE, assignee_id: OTHER() }] }];
    await expect(svc.docUrl(deps(), CASE, actor, "r")).rejects.toMatchObject({
      code: "NOT_ASSIGNEE",
    });
    expect(sql(/audit_events/).length).toBe(0);
  });
  it("issues a 15-min HMAC-signed URL and audits issuance", async () => {
    process.env.DOC_SIGNING_KEY = "unit-key";
    answers = [{ match: /FROM kyc_cases/, rows: [{ id: CASE, assignee_id: actor.sub }] }];
    const out = await svc.docUrl(deps(), CASE, actor, "r7");
    expect(out.url).toMatch(/^https:\/\/docs\.local\/kyc\//);
    expect(out.url).toMatch(/sig=[0-9a-f]{64}$/);
    expect(out.url).not.toContain("/api/v1/");
    const ttl = Date.parse(out.expires_at) - Date.now();
    expect(ttl).toBeGreaterThan(840_000);
    expect(ttl).toBeLessThanOrEqual(900_000);
    const audit = sql(/INSERT INTO audit_events/)[0]!;
    expect(audit.params![1]).toBe("case.doc_url");
    expect(JSON.parse(audit.params![4] as string)).toEqual({ ttl_seconds: 900 });
  });
  it("production without DOC_SIGNING_KEY → 503 DOC_SIGNING_KEY_MISSING", async () => {
    process.env.NODE_ENV = "production";
    answers = [{ match: /FROM kyc_cases/, rows: [{ id: CASE, assignee_id: actor.sub }] }];
    await expect(svc.docUrl(deps(), CASE, actor, "r")).rejects.toMatchObject({
      code: "DOC_SIGNING_KEY_MISSING",
      statusCode: 503,
    });
  });
  it("supervisor issues for any case (assignee bypass)", async () => {
    process.env.DOC_SIGNING_KEY = "unit-key";
    answers = [{ match: /FROM kyc_cases/, rows: [{ id: CASE, assignee_id: OTHER() }] }];
    const out = await svc.docUrl(deps(), CASE, sup, "r");
    expect(out.url).toContain("sig=");
  });
});

describe("read surfaces — getCase / caseAudit / allAudit / slaDigest", () => {
  it("getCase returns the masked row; 404 when absent", async () => {
    answers = [{ match: /SELECT .* FROM kyc_cases/, rows: [caseRow()] }];
    const k = await svc.getCase(deps(), CASE);
    expect(k.id).toBe(CASE);
    answers = []; // absent row → NOT_FOUND
    await expect(svc.getCase(deps(), "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("caseAudit reads audit_events ordered by id for the case", async () => {
    answers = [{ match: /audit_events/, rows: [{ action: "case.in_review" }] }];
    const rows = await svc.caseAudit(deps(), CASE);
    expect(rows[0]!.action).toBe("case.in_review");
    expect(sql(/audit_events/)[0]!.text).toContain("ORDER BY id");
  });
  it("allAudit hard-caps at LIMIT 500 (export boundary)", async () => {
    await svc.allAudit(deps());
    const q = sql(/audit_events/)[0]!;
    expect(q.text).toContain("LIMIT 500");
    expect(q.text).toContain("ORDER BY id DESC");
  });
  it("slaDigest aggregates breaching counts by status", async () => {
    answers = [
      { match: /GROUP BY status/, rows: [{ status: "PENDING", n: 3 }, { status: "IN_REVIEW", n: 2 }] },
    ];
    const out = await svc.slaDigest(deps());
    expect(out).toEqual({ breaching: 5, by_status: { PENDING: 3, IN_REVIEW: 2 } });
  });
  it("slaDigest reports zero when nothing breaches", async () => {
    const out = await svc.slaDigest(deps());
    expect(out).toEqual({ breaching: 0, by_status: {} });
  });
});
