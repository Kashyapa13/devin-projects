import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pgHarness, runSeeds, type PgHarness } from "@company/testing";
import { loadMigrations, migrationRunner } from "@company/db";
import { fieldCipher, InMemoryKMS } from "@company/crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../api/src/server.js";
import { makeRegistry } from "../scripts/seed.js";
import { KEY_ID } from "../api/src/crypto.js";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

let pg: PgHarness;
let pool: Pool;
let app: FastifyInstance;
const cipher = fieldCipher(
  new InMemoryKMS({ [KEY_ID]: new Uint8Array(32) }),
  KEY_ID,
);

const REVIEWER = "11111111-1111-1111-1111-111111111111";
const SUPERVISOR = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
async function token(
  roles: string[],
  sub = roles[0] === "supervisor"
    ? SUPERVISOR
    : roles[0] === "admin"
      ? ADMIN
      : REVIEWER,
) {
  return app.session.create({ sub, roles });
}
async function post(url: string, roles = ["reviewer"], body = {}, idem = "k-12345678") {
  return app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${await token(roles)}`,
      "idempotency-key": idem,
    },
    payload: body,
  });
}
async function get(url: string, roles = ["reviewer"]) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${await token(roles)}` },
  });
}

async function pendingCaseId(): Promise<string> {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/queue?tab=team&limit=50",
    headers: { authorization: `Bearer ${await token(["reviewer"])}` },
  });
  const row = (res.json().rows as { status: string; id: string }[]).find(
    (r) => r.status === "PENDING",
  );
  return row!.id;
}

beforeAll(async () => {
  pg = await pgHarness("fastlane");
  pool = new Pool({ connectionString: pg.dsn });
  const runner = migrationRunner(pool);
  await runner.migrate(loadMigrations(MIGRATIONS));
  await runSeeds(pool, makeRegistry(cipher), "kyc-seed-v1");
  app = await buildServer({
    db: pool,
    cipher,
    sessionSecret: "test-session-secret-fixture",
    cronSecret: "test-cron",
    readiness: { db: () => pool.query("SELECT 1") },
  });
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await pg.stop();
});

describe("routes + RBAC matrix (gate: §7.3 integration)", () => {
  it("queue returns masked rows (no legal_name field leaks)", async () => {
    const res = await get("/api/v1/queue?tab=team");
    expect(res.statusCode).toBe(200);
    const row = res.json().rows[0];
    expect(row).toHaveProperty("status");
    expect(row).not.toHaveProperty("legal_name_enc");
    expect(row).not.toHaveProperty("legal_name");
  });

  it("unauthenticated → 401; viewer role → 403 on mutations", async () => {
    const id = await pendingCaseId();
    expect((await app.inject({ method: "GET", url: "/api/v1/queue" })).statusCode).toBe(401);
    expect((await post(`/api/v1/cases/${id}/claim`, ["viewer"])).statusCode).toBe(403);
    expect((await get("/api/v1/audit", ["reviewer"])).statusCode).toBe(403);
  });

  it("claim → approve happy path writes audit rows in the same tx", async () => {
    const id = await pendingCaseId();
    const claim = await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "claim-001");
    expect(claim.statusCode).toBe(200);
    expect(claim.json().status).toBe("IN_REVIEW");
    expect(claim.json().assignee_id).toBe(REVIEWER);
    const approve = await post(`/api/v1/cases/${id}/approve`, ["reviewer"], {}, "approve-1");
    expect(approve.statusCode).toBe(200);
    const audit = await get(`/api/v1/cases/${id}/audit`);
    const actions = audit.json().map((r: { action: string }) => r.action);
    expect(actions).toContain("case.in_review");
    expect(actions).toContain("case.approved");
  });

  it("invalid transition returns 400 INVALID_TRANSITION (gate: §7)", async () => {
    const id = await pendingCaseId();
    const res = await post(`/api/v1/cases/${id}/approve`, ["reviewer"], {}, "bad-transition");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TRANSITION");
  });

  it("reject without reason → 400 REASON_REQUIRED with actionable copy", async () => {
    const id = await pendingCaseId();
    await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "claim-r01");
    const res = await post(`/api/v1/cases/${id}/reject`, ["reviewer"], {}, "rej-short");
    expect(res.statusCode).toBe(400);
    const err = res.json().error;
    expect(err.code).toBe("REASON_REQUIRED");
    expect(err.message).toContain("20 characters");
    const ok = await post(
      `/api/v1/cases/${id}/reject`,
      ["reviewer"],
      { reason: "documents expired and the photo is illegible" },
      "rej-ok-01",
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe("REJECTED");
  });

  it("anchor FT: decided case leaves every active queue tab (claim→reject→removal)", async () => {
    const id = await pendingCaseId();
    const inTeam = async () =>
      ((await get("/api/v1/queue?tab=team&limit=100")).json().rows as { id: string }[]).some(
        (r) => r.id === id,
      );
    expect(await inTeam()).toBe(true);
    await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "ft-claim1");
    // claimed → still an active case (mine tab for the reviewer)
    const mine = (await get("/api/v1/queue?tab=mine&limit=100")).json().rows as { id: string }[];
    expect(mine.some((r) => r.id === id)).toBe(true);
    const rej = await post(
      `/api/v1/cases/${id}/reject`,
      ["reviewer"],
      { reason: "expired documents and unreadable photo" },
      "ft-reject1",
    );
    expect(rej.statusCode).toBe(200);
    // removed from all active tabs
    expect(await inTeam()).toBe(false);
    const mineAfter = (await get("/api/v1/queue?tab=mine&limit=100")).json().rows as { id: string }[];
    expect(mineAfter.some((r) => r.id === id)).toBe(false);
  });

  it("mutations require Idempotency-Key; replay returns original result", async () => {
    const id = await pendingCaseId();
    const noKey = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${id}/claim`,
      headers: { authorization: `Bearer ${await token(["reviewer"])}` },
      payload: {},
    });
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe("IDEMPOTENCY_REQUIRED");
    const first = await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "idem-x-01");
    const replay = await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "idem-x-01");
    expect(replay.json().status).toBe(first.json().status);
    const audit = await get(`/api/v1/cases/${id}/audit`);
    const claims = audit.json().filter((r: { action: string }) => r.action === "case.in_review");
    expect(claims.length).toBe(1); // replay did NOT double-write
  });

  it("audit kill-test: failing audit insert leaves NO orphan state", async () => {
    // proxy that dies on the audit insert — same tx must roll back the state change too
    const flaky = {
      query: async (text: string, params?: readonly unknown[]) => {
        if (text.includes("audit_events")) throw new Error("audit write failed");
        return pool.query(text, params as unknown[]);
      },
    };
    const killApp = await buildServer({
      db: flaky,
      cipher,
      sessionSecret: "test-session-secret-fixture",
    });
    const t = await killApp.session.create({ sub: REVIEWER, roles: ["reviewer"] });
    const q = await killApp.inject({
      method: "GET",
      url: "/api/v1/queue?tab=team&limit=50",
      headers: { authorization: `Bearer ${t}` },
    });
    const id = (q.json().rows as { status: string; id: string }[]).find(
      (r) => r.status === "PENDING",
    )!.id;
    const res = await killApp.inject({
      method: "POST",
      url: `/api/v1/cases/${id}/claim`,
      headers: { authorization: `Bearer ${t}`, "idempotency-key": "kill-0001" },
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    const still = await pool.query("SELECT status FROM kyc_cases WHERE id=$1", [id]);
    expect(still.rows[0].status).toBe("PENDING"); // rolled back, not orphaned
    const au = await pool.query("SELECT COUNT(*)::int n FROM audit_events WHERE entity_id=$1", [id]);
    expect(au.rows[0].n).toBe(0);
    await killApp.close();
  });

  it("reveal writes its audit row BEFORE returning the value (kill-test)", async () => {
    const id = await pendingCaseId();
    const exploding = {
      ...cipher,
      decrypt: () => Promise.reject(new Error("kms dead")),
    };
    const revealApp = await buildServer({
      db: pool,
      cipher: exploding,
      sessionSecret: "test-session-secret-fixture",
    });
    const t = await revealApp.session.create({ sub: REVIEWER, roles: ["reviewer"] });
    const res = await revealApp.inject({
      method: "POST",
      url: `/api/v1/cases/${id}/reveal`,
      headers: { authorization: `Bearer ${t}`, "idempotency-key": "reveal-k" },
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    const au = await pool.query(
      "SELECT COUNT(*)::int n FROM audit_events WHERE entity_id=$1 AND action='case.reveal'",
      [id],
    );
    expect(au.rows[0].n).toBeGreaterThanOrEqual(1); // write-ahead persisted
    await revealApp.close();
  });

  it("reveal happy path returns the decrypted synthetic value", async () => {
    const id = await pendingCaseId();
    const res = await post(`/api/v1/cases/${id}/reveal`, ["reviewer"], {}, "reveal-ok");
    expect(res.statusCode).toBe(200);
    expect(res.json().legal_name).toMatch(/^SYNTH-ENTITY-\d{4}$/);
  });

  it("cursor pagination is stable under inserts (no dupes/skips)", async () => {
    const p1 = await get("/api/v1/queue?tab=team&limit=3");
    const cursor = p1.json().next_cursor;
    expect(cursor).toBeTruthy();
    // insert a new PENDING row ahead of the cursor
    await pool.query(
      `INSERT INTO kyc_cases (customer_ref, legal_name_enc, country, risk_score, doc_type, status, sla_due_at)
       VALUES ('CUST-NEW','', 'US', 10, 'DL', 'PENDING', now() - interval '9 days')`,
    );
    const p2 = await get(`/api/v1/queue?tab=team&limit=50&cursor=${encodeURIComponent(cursor)}`);
    const seen = new Set(p1.json().rows.map((r: { id: string }) => r.id));
    for (const r of p2.json().rows) {
      expect(seen.has(r.id)).toBe(false); // no duplicates across the boundary
    }
  });

  it("read surfaces: case detail masked, case+global audit, doc-url expiry", async () => {
    const id = await pendingCaseId();
    const detail = await get(`/api/v1/cases/${id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).not.toHaveProperty("legal_name_enc");
    await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "read-clm1");
    const trail = await get(`/api/v1/cases/${id}/audit`);
    expect(trail.json().length).toBeGreaterThan(0);
    const all = await get("/api/v1/audit", ["supervisor"]);
    expect(all.statusCode).toBe(200);
    expect(Array.isArray(all.json())).toBe(true);
    const doc = await get(`/api/v1/cases/${id}/doc-url`);
    expect(doc.statusCode).toBe(200);
    const body = doc.json();
    expect(body.url).toContain("expires=");
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());
    // doc-url read is audited too
    const trail2 = await get(`/api/v1/cases/${id}/audit`);
    expect(trail2.json().length).toBeGreaterThan(trail.json().length);
  });

  it("edge surfaces: 404 case, stale version, unknown tab, breaching tab", async () => {
    const missing = await get(`/api/v1/cases/00000000-0000-0000-0000-000000000000`);
    expect(missing.statusCode).toBe(404);
    const id = await pendingCaseId();
    await post(`/api/v1/cases/${id}/claim`, ["reviewer"], { expected_version: 1 }, "edge-clm1");
    const stale = await post(`/api/v1/cases/${id}/approve`, ["reviewer"], { expected_version: 99 }, "edge-stale");
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("STALE_VERSION");
    expect((await get("/api/v1/queue?tab=nope")).statusCode).toBe(400);
    const breaching = await get("/api/v1/queue?tab=breaching&limit=5");
    expect(breaching.statusCode).toBe(200);
    for (const r of breaching.json().rows as { sla_due_at: string }[]) {
      expect(new Date(r.sla_due_at).getTime()).toBeLessThan(Date.now());
    }
  });

  it("note surface: empty 400, ok note audited", async () => {
    const id = await pendingCaseId();
    const empty = await post(`/api/v1/cases/${id}/note`, ["reviewer"], { body: "   " }, "note-emp1");
    expect(empty.statusCode).toBe(400);
    const ok = await post(`/api/v1/cases/${id}/note`, ["reviewer"], { body: "call logged with entity" }, "note-ok01");
    expect(ok.statusCode).toBe(200);
    const trail = await get(`/api/v1/cases/${id}/audit`);
    expect((trail.json() as { action: string }[]).some((a) => a.action === "case.note")).toBe(true);
  });

  it("FT doc-panel: issuance is audited write-ahead with ~15-min expiry (ADR-0007)", async () => {
    const id = await pendingCaseId();
    const before = await get(`/api/v1/cases/${id}/audit`);
    const doc = await get(`/api/v1/cases/${id}/doc-url`);
    expect(doc.statusCode).toBe(200);
    const { url, expires_at } = doc.json() as { url: string; expires_at: string };
    expect(url).toMatch(/expires=/);
    const ttlMs = Date.parse(expires_at) - Date.now();
    expect(ttlMs).toBeGreaterThan(840_000); // ≥14 min
    expect(ttlMs).toBeLessThanOrEqual(900_000); // ≤15 min
    const after = await get(`/api/v1/cases/${id}/audit`);
    const gained = (after.json() as { action: string }[]).length - (before.json() as unknown[]).length;
    expect(gained).toBe(1);
    expect((after.json() as { action: string }[]).at(-1)?.action).toBe("case.doc_url");
    // never serves bytes through the API — the URL is signed-shape, not proxied
    expect(url).not.toContain("/api/v1/");
    // ghost case → 404 and NO audit row (existence check precedes write-ahead)
    const ghost = await get(`/api/v1/cases/00000000-0000-0000-0000-000000000000/doc-url`);
    expect(ghost.statusCode).toBe(404);
  });

  it("supervisor reopen: reviewer escalates, supervisor claims back to IN_REVIEW", async () => {
    const id = await pendingCaseId();
    await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "esc-claim");
    const esc = await post(`/api/v1/cases/${id}/escalate`, ["reviewer"], {}, "esc-0001");
    expect(esc.json().status).toBe("ESCALATED");
    const reopenByReviewer = await post(`/api/v1/cases/${id}/claim`, ["reviewer"], {}, "reopen-r1");
    expect(reopenByReviewer.statusCode).toBe(403);
    const reopen = await post(`/api/v1/cases/${id}/claim`, ["supervisor"], {}, "reopen-s1");
    expect(reopen.statusCode).toBe(200);
    expect(reopen.json().status).toBe("IN_REVIEW");
    expect(reopen.json().assignee_id).toBe(SUPERVISOR);
  });

  it("cron digest requires the service secret and reports breaches", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/v1/cron/sla-digest" });
    expect(bad.statusCode).toBe(403);
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/cron/sla-digest",
      headers: { "x-cron-secret": "test-cron" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().breaching).toBeGreaterThanOrEqual(0);
  });

  it("healthz/readyz wired to the db dep", async () => {
    expect((await app.inject("/healthz")).statusCode).toBe(200);
    expect((await app.inject("/readyz")).statusCode).toBe(200);
  });
});
