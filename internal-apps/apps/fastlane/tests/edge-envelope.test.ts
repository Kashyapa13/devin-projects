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

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "../db/migrations");

let pg: PgHarness;
let pool: Pool;
let app: FastifyInstance;
const cipher = fieldCipher(new InMemoryKMS({ [KEY_ID]: new Uint8Array(32) }), KEY_ID);

const REVIEWER = "11111111-1111-1111-1111-111111111111";
const SUPERVISOR = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const CASE_RE = /[0-9a-f-]{36}/;

const token = (roles: string[], sub?: string) =>
  app.session.create({
    sub: sub ?? (roles[0] === "supervisor" ? SUPERVISOR : roles[0] === "admin" ? ADMIN : REVIEWER),
    roles,
  });
const env = (body: unknown) => (body as { error?: { code?: string; message?: string; detail?: unknown; req_id?: string } }).error;

beforeAll(async () => {
  pg = await pgHarness("fastlane");
  pool = new Pool({ connectionString: pg.dsn });
  await migrationRunner(pool).migrate(loadMigrations(MIGRATIONS));
  await runSeeds(pool, makeRegistry(cipher), "kyc-seed-v1");
  app = await buildServer({ db: pool, cipher, sessionSecret: "test-session-secret-fixture", cronSecret: "test-cron" });
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await pg.stop();
});

async function req(method: "GET" | "POST", url: string, opts: { roles?: string[]; sub?: string; idem?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.roles) headers.authorization = `Bearer ${await token(opts.roles, opts.sub)}`;
  if (opts.idem) headers["idempotency-key"] = opts.idem;
  return app.inject({ method, url, headers, payload: opts.body as object | undefined });
}
const pendingId = async () => {
  const res = await req("GET", "/api/v1/queue?tab=team&limit=100", { roles: ["reviewer"] });
  return (res.json().rows as { status: string; id: string }[]).find((r) => r.status === "PENDING")!.id;
};

describe("queue param boundaries", () => {
  for (const [limit, expected] of [
    ["abc", 400], ["-5", 400], ["0", 400], ["25.5", 400],
    ["1", 200], ["100", 200], ["101", 200], ["499", 200], ["500", 200], ["5001", 200],
    ["99999999999999999999", 200], // huge-but-integer → clamps to 100
  ] as const) {
    it(`?limit=${limit} → ${expected}`, async () => {
      const res = await req("GET", `/api/v1/queue?tab=team&limit=${limit}`, { roles: ["reviewer"] });
      expect(res.statusCode).toBe(expected);
      if (expected === 400) expect(env(res.json())!.code).toBe("VALIDATION");
      if (expected === 200) expect(res.json().rows.length).toBeLessThanOrEqual(100);
    });
  }
  it("malformed cursors → 400 VALIDATION", async () => {
    for (const c of ["!!!bad", "AAAA", Buffer.from("1700000000").toString("base64url")]) {
      const res = await req("GET", `/api/v1/queue?tab=team&cursor=${encodeURIComponent(c)}`, { roles: ["reviewer"] });
      expect(res.statusCode).toBe(400);
      expect(env(res.json())!.code).toBe("VALIDATION");
    }
  });
  it("cursor roundtrip: page 2 starts strictly after page 1", async () => {
    const p1 = await req("GET", "/api/v1/queue?tab=team&limit=2", { roles: ["reviewer"] });
    const p2 = await req("GET", `/api/v1/queue?tab=team&limit=50&cursor=${encodeURIComponent(p1.json().next_cursor)}`, { roles: ["reviewer"] });
    expect(p2.statusCode).toBe(200);
    const first = new Set((p1.json().rows as { id: string }[]).map((r) => r.id));
    for (const r of p2.json().rows as { id: string }[]) expect(first.has(r.id)).toBe(false);
  });
});

describe(":id must be a uuid — never a 500", () => {
  const bad = ["not-a-uuid", "1234", "xxxx-xxxx-xxxx", "' OR '1'='1", "%00"];
  for (const id of bad) {
    it(`GET /cases/${id.slice(0, 12)} → 400 VALIDATION`, async () => {
      const res = await req("GET", `/api/v1/cases/${id}`, { roles: ["reviewer"] });
      expect(res.statusCode).toBe(400);
      expect(env(res.json())!.code).toBe("VALIDATION");
    });
  }
  it("mutations on non-uuid ids → 400 not 500", async () => {
    for (const m of ["claim", "approve", "reject", "escalate", "note", "reveal"] as const) {
      const res = await req("POST", `/api/v1/cases/nope/${m}`, { roles: ["reviewer"], idem: "edge-uuid-1", body: m === "note" ? { body: "x" } : {} });
      expect(res.statusCode, m).toBe(400);
    }
    const doc = await req("GET", "/api/v1/cases/nope/doc-url", { roles: ["reviewer"] });
    expect(doc.statusCode).toBe(400);
    const audit = await req("GET", "/api/v1/cases/nope/audit", { roles: ["reviewer"] });
    expect(audit.statusCode).toBe(400);
  });
});

describe("idempotency boundary", () => {
  it("keys shorter than 8 chars → 400 IDEMPOTENCY_REQUIRED", async () => {
    const id = await pendingId();
    for (const k of ["", "short", "1234567"]) {
      const res = await app.inject({
        method: "POST", url: `/api/v1/cases/${id}/claim`,
        headers: { authorization: `Bearer ${await token(["reviewer"])}`, ...(k ? { "idempotency-key": k } : {}) },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(env(res.json())!.code).toBe("IDEMPOTENCY_REQUIRED");
    }
  });
  it("exactly-8-char key is accepted", async () => {
    const id = await pendingId();
    const res = await req("POST", `/api/v1/cases/${id}/claim`, { roles: ["reviewer"], idem: "12345678", body: {} });
    expect(res.statusCode).toBe(200);
  });
});

describe("auditor read-only (admin) — reads everywhere, mutates nowhere", () => {
  it("admin reads queue/case/audit surfaces", async () => {
    const q = await req("GET", "/api/v1/queue?tab=team", { roles: ["admin"] });
    expect(q.statusCode).toBe(200);
    const id = (q.json().rows as { id: string }[])[0]!.id;
    expect((await req("GET", `/api/v1/cases/${id}`, { roles: ["admin"] })).statusCode).toBe(200);
    expect((await req("GET", `/api/v1/cases/${id}/audit`, { roles: ["admin"] })).statusCode).toBe(200);
    expect((await req("GET", "/api/v1/audit", { roles: ["admin"] })).statusCode).toBe(200);
  });
  it("admin is 403 on every mutation endpoint", async () => {
    const id = await pendingId();
    for (const m of ["claim", "approve", "reject", "escalate", "note", "reveal"] as const) {
      const res = await req("POST", `/api/v1/cases/${id}/${m}`, { roles: ["admin"], idem: `adm-${m}-1`, body: m === "note" ? { body: "x" } : {} });
      expect(res.statusCode, m).toBe(403);
    }
    expect((await req("GET", `/api/v1/cases/${id}/doc-url`, { roles: ["admin"] })).statusCode).toBe(403);
  });
  it("reviewer cannot read /audit export (403)", async () => {
    expect((await req("GET", "/api/v1/audit", { roles: ["reviewer"] })).statusCode).toBe(403);
  });
});

describe("not-assignee corpus — acting on another's case is always 403", () => {
  it("second reviewer cannot approve/reject/escalate/note/reveal/doc-url on reviewer's case", async () => {
    const id = await pendingId();
    await req("POST", `/api/v1/cases/${id}/claim`, { roles: ["reviewer"], idem: "na-claim-1", body: {} });
    const other = "55555555-5555-5555-5555-555555555555";
    for (const m of ["approve", "escalate", "note", "reveal"] as const) {
      const res = await req("POST", `/api/v1/cases/${id}/${m}`, { roles: ["reviewer"], sub: other, idem: `na-${m}-1`, body: m === "note" ? { body: "x" } : {} });
      expect(res.statusCode, m).toBe(403);
      expect(env(res.json())!.code).toBe("NOT_ASSIGNEE");
    }
    const rej = await req("POST", `/api/v1/cases/${id}/reject`, { roles: ["reviewer"], sub: other, idem: "na-rej-1", body: { reason: "x".repeat(20) } });
    expect(rej.statusCode).toBe(403);
    expect((await req("GET", `/api/v1/cases/${id}/doc-url`, { roles: ["reviewer"], sub: other })).statusCode).toBe(403);
    // denied attempts mint no audit rows
    const audit = await req("GET", `/api/v1/cases/${id}/audit`, { roles: ["supervisor"] });
    const actions = (audit.json() as { action: string }[]).map((a) => a.action);
    expect(actions).toEqual(["case.in_review"]);
  });
});

describe("audit export boundary — hard LIMIT 500", () => {
  it("501 audit rows in the table → export returns exactly 500", async () => {
    const id = await pendingId();
    await req("POST", `/api/v1/cases/${id}/claim`, { roles: ["reviewer"], idem: "lim500-clm", body: {} });
    for (let i = 0; i < 501; i++) {
      await pool.query(
        `INSERT INTO audit_events (actor, action, entity, entity_id, detail, req_id, at)
         VALUES ('bulk','case.note','kyc_case',$1,'{}','bulk', now() + ($2 || ' microseconds')::interval)`,
        [id, i],
      );
    }
    const res = await req("GET", "/api/v1/audit", { roles: ["admin"] });
    expect(res.statusCode).toBe(200);
    expect((res.json() as unknown[]).length).toBe(500);
  });
});

describe("attempted-escape corpus — hostile inputs rejected, never 500, never data", () => {
  const CASES: { name: string; url: string }[] = [
    { name: "sql meta in tab", url: "/api/v1/queue?tab=team';DROP TABLE users;--" },
    { name: "union in tab", url: "/api/v1/queue?tab=team UNION SELECT * FROM users--" },
    { name: "wildcard tab", url: "/api/v1/queue?tab=*" },
    { name: "oversized tab", url: `/api/v1/queue?tab=${"x".repeat(5000)}` },
    { name: "limit expression", url: "/api/v1/queue?limit=1;DELETE FROM kyc_cases" },
    { name: "cursor path traversal", url: "/api/v1/queue?cursor=../../etc/passwd" },
    { name: "cursor null byte", url: "/api/v1/queue?cursor=%00%00" },
    { name: "uuid-shaped wrong case", url: "/api/v1/cases/00000000-0000-0000-0000-000000000000" },
    { name: "sql meta in id", url: "/api/v1/cases/1' OR '1'='1" },
    { name: "traversal in id", url: "/api/v1/cases/..%2F..%2Fadmin" },
    { name: "empty segments", url: "/api/v1/cases//audit" },
  ];
  for (const c of CASES) {
    it(`${c.name} → rejected (400/404), envelope only`, async () => {
      const res = await req("GET", c.url, { roles: ["reviewer"] });
      expect([400, 404]).toContain(res.statusCode);
      const e = env(res.json());
      expect(e).toBeTruthy();
      expect(typeof e!.code).toBe("string");
      expect(typeof e!.req_id).toBe("string");
    });
  }
  it("hostile body fields on reject → no crash", async () => {
    const id = await pendingId();
    await req("POST", `/api/v1/cases/${id}/claim`, { roles: ["reviewer"], idem: "esc-claim9", body: {} });
    const res = await req("POST", `/api/v1/cases/${id}/reject`, {
      roles: ["reviewer"], idem: "esc-rej-9",
      body: { reason: "'; DROP TABLE audit_events;--" },
    });
    expect([200, 400]).toContain(res.statusCode);
    const tables = await pool.query("SELECT COUNT(*)::int n FROM audit_events");
    expect(tables.rows[0].n).toBeGreaterThan(0); // nothing was dropped
  });
});

describe("X-Request-ID correlation (log/audit contract)", () => {
  it("echoes inbound X-Request-ID on the response and the audit row", async () => {
    const id = await pendingId();
    const res = await req("POST", `/api/v1/cases/${id}/claim`, {
      roles: ["reviewer"], idem: "xrid-claim", body: {},
      headers: { "x-request-id": "req-obs-0001" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBe("req-obs-0001");
    const audit = await pool.query("SELECT req_id FROM audit_events WHERE entity_id=$1 ORDER BY id DESC LIMIT 1", [id]);
    expect(audit.rows[0].req_id).toBe("req-obs-0001");
  });
  it("mints a uuid req_id when the header is absent", async () => {
    const res = await req("GET", "/api/v1/queue?tab=team&limit=1", { roles: ["reviewer"] });
    expect(String(res.headers["x-request-id"])).toMatch(CASE_RE);
  });
});

describe("golden shapes — error envelope & audit row", () => {
  it("error envelope: {error:{code,message,detail?,req_id}} for every class", async () => {
    // 400 VALIDATION
    const v = env((await req("GET", "/api/v1/queue?tab=nope", { roles: ["reviewer"] })).json())!;
    expect(Object.keys(v).sort()).toEqual(["code", "message", "req_id"]);
    expect(v.code).toBe("VALIDATION");
    // 400 REASON_REQUIRED carries detail {min,got}
    const id = await pendingId();
    await req("POST", `/api/v1/cases/${id}/claim`, { roles: ["reviewer"], idem: "gold-clm", body: {} });
    const r = env((await req("POST", `/api/v1/cases/${id}/reject`, { roles: ["reviewer"], idem: "gold-rej", body: { reason: "short" } })).json())!;
    expect(r).toMatchObject({ code: "REASON_REQUIRED", detail: { min: 20, got: 5 } });
    expect(r.message).toContain("20 characters");
    // 401 UNAUTHORIZED
    const u = env((await app.inject({ method: "GET", url: "/api/v1/queue" })).json())!;
    expect(u.code).toBe("UNAUTHORIZED");
    // 403 FORBIDDEN
    const f = env((await req("GET", "/api/v1/audit", { roles: ["reviewer"] })).json())!;
    expect(f.code).toBe("FORBIDDEN");
    // 404 NOT_FOUND (route + resource)
    const nf = env((await req("GET", "/api/v1/does-not-exist", { roles: ["reviewer"] })).json())!;
    expect(nf).toMatchObject({ code: "NOT_FOUND" });
    // 409 STALE_VERSION
    const stale = env((await req("POST", `/api/v1/cases/${id}/approve`, { roles: ["reviewer"], idem: "gold-stale", body: { expected_version: 99 } })).json())!;
    expect(stale.code).toBe("STALE_VERSION");
    // req_id is always a uuid
    for (const e of [v, r, u, f, nf, stale]) expect(e.req_id).toMatch(CASE_RE);
  });
  it("audit row: {actor,action,entity,entity_id,detail,req_id,at} — golden", async () => {
    const id = await pendingId();
    await req("POST", `/api/v1/cases/${id}/claim`, {
      roles: ["reviewer"], idem: "gold-aud", body: {},
      headers: { "x-request-id": "req-golden-1" },
    });
    const res = await req("GET", `/api/v1/cases/${id}/audit`, { roles: ["reviewer"] });
    const row = (res.json() as Record<string, unknown>[]).at(-1)!;
    expect(Object.keys(row).sort()).toEqual(["action", "actor", "at", "detail", "entity", "entity_id", "req_id"]);
    expect(row).toMatchObject({
      actor: REVIEWER,
      action: "case.in_review",
      entity: "kyc_case",
      entity_id: id,
      detail: { from: "PENDING", to: "IN_REVIEW" },
      req_id: "req-golden-1",
    });
    expect(Number.isFinite(Date.parse(row.at as string))).toBe(true);
  });
});

describe("schema boundaries — risk_score CHECK + append-only + status CHECK", () => {
  for (const [score, ok] of [[-1, false], [0, true], [100, true], [101, false]] as const) {
    it(`risk_score ${score} → ${ok ? "accepted" : "CHECK violation"}`, async () => {
      const insert = pool.query(
        `INSERT INTO kyc_cases (customer_ref, country, risk_score, doc_type, status, sla_due_at)
         VALUES ('CUST-EDGE', 'US', $1, 'DL', 'PENDING', now())`,
        [score],
      );
      if (ok) await expect(insert).resolves.toBeTruthy();
      else await expect(insert).rejects.toMatchObject({ code: "23514" });
    });
  }
  it("illegal status value → CHECK violation (DB backstop)", async () => {
    await expect(
      pool.query(
        `INSERT INTO kyc_cases (customer_ref, country, risk_score, doc_type, status, sla_due_at)
         VALUES ('CUST-EDGE', 'US', 10, 'DL', 'PHANTOM', now())`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("audit_events is append-only for non-privileged roles (REVOKE enforced)", async () => {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='audit_reader') THEN CREATE ROLE audit_reader LOGIN PASSWORD 'fixture-only'; END IF; END $$`);
    await pool.query(`GRANT CONNECT ON DATABASE fastlane TO audit_reader`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO audit_reader`);
    await pool.query(`GRANT SELECT, INSERT ON audit_events TO audit_reader`);
    await pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO audit_reader`);
    const reader = new Pool({ connectionString: pg.dsn.replace(/postgres(ql)?:\/\/[^:]+:[^@]+@/, "postgresql://audit_reader:fixture-only@") });
    try {
      await expect(reader.query("UPDATE audit_events SET action='tampered'")).rejects.toMatchObject({ code: "42501" });
      await expect(reader.query("DELETE FROM audit_events")).rejects.toMatchObject({ code: "42501" });
      await expect(reader.query("INSERT INTO audit_events (actor,action,entity,entity_id) VALUES ('a','b','c','d')")).resolves.toBeTruthy(); // append allowed
    } finally {
      await reader.end();
    }
  });
});
