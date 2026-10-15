import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { newDb, DataType } from "pg-mem";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Route tests: the real Fastify app from api/src/server.ts against an
 * in-memory Postgres (pg-mem) — the "pg" module is mocked so the app's
 * pool lands on the same db the test asserts against. Schema = the real
 * db/migrations SQL, so drift between migration and route SQL fails here.
 */
const mem = newDb();
mem.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  implementation: () => randomUUID(),
  impure: true,
});
const { Pool: MemPool } = mem.adapters.createPg();
const pool = new MemPool();

vi.mock("pg", () => ({ default: { Pool: MemPool }, Pool: MemPool }));

const LABEL_HEADER = "capability demo - production continues on Power Apps";
const LABEL = "capability demo — production continues on Power Apps";
const HERE = dirname(fileURLToPath(import.meta.url));

type Role = "viewer" | "flag_editor" | "flag_admin" | "none";
const H = (role: Role, actor = "ut-actor") =>
  role === "none"
    ? { "x-demo-actor": actor }
    : { "x-demo-role": role, "x-demo-actor": actor };

const seed = async () => {
  const flags = [
    { key: "demo-hero", env: "dev", t: { default_enabled: true } },
    { key: "demo-hero", env: "prod", t: { default_enabled: false } },
    { key: "demo-checkout-v2", env: "staging", t: { enabled_if: { bucket_lt: 25 } } },
    { key: "demo-envscope", env: "dev", t: { default_enabled: false } },
    { key: "demo-envscope", env: "staging", t: { default_enabled: false } },
    { key: "demo-envscope", env: "prod", t: { default_enabled: false } },
    { key: "demo-rbac-put", env: "dev", t: { default_enabled: false } },
    { key: "demo-rbac-put", env: "prod", t: { default_enabled: false } },
    { key: "demo-new-nav", env: "dev", t: { default_enabled: false } },
  ];
  for (const f of flags)
    await pool.query(
      `INSERT INTO flags (key,env,description,targeting) VALUES ($1,$2,'seed',$3)`,
      [f.key, f.env, JSON.stringify(f.t)],
    );
};

let app: any;

// Mirrors the web client: content-type only when a JSON body is actually sent
// (a declared-but-empty JSON body is rejected by Fastify — FST_ERR_CTP_EMPTY_JSON_BODY).
const call = (o: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  role?: Role;
  actor?: string;
  payload?: unknown;
}) =>
  app.inject({
    method: o.method,
    url: o.url,
    headers: {
      ...H(o.role ?? "none", o.actor),
      ...(o.payload !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(o.payload !== undefined ? { payload: JSON.stringify(o.payload) } : {}),
  });

const flagId = async (key: string, env: string): Promise<string> => {
  const { rows } = await pool.query(`SELECT id FROM flags WHERE key=$1 AND env=$2`, [key, env]);
  return rows[0].id as string;
};

const auditRows = async (action?: string) => {
  const { rows } = await pool.query(
    `SELECT flag_id, actor, action, detail, at FROM flag_audit_events
     ${action ? "WHERE action = $1" : ""} ORDER BY id`,
    action ? [action] : [],
  );
  return rows as any[];
};

beforeAll(async () => {
  await pool.query(
    readFileSync(join(HERE, "..", "db", "migrations", "0001_init.up.sql"), "utf8"),
  );
  await seed();
  const { buildApp } = await import("../api/src/server.js");
  app = buildApp();
});

afterAll(async () => {
  await app?.close();
  await pool.end();
});

describe("label law — demo contract on every surface", () => {
  it("every response carries x-demo-label; list body carries demo:true + verbatim label", async () => {
    const list = await call({ method: "GET", url: "/api/flags" });
    expect(list.headers["x-demo-label"]).toBe(LABEL_HEADER);
    expect(list.json().demo).toBe(true);
    expect(list.json().label).toBe(LABEL);
    const err = await call({ method: "POST", url: "/api/flags", role: "viewer", payload: {} });
    expect(err.statusCode).toBe(403);
    expect(err.headers["x-demo-label"]).toBe(LABEL_HEADER); // errors are labeled too
  });
});

describe("static panel serving (setNotFoundHandler) — deployed unit serves dist-web", () => {
  // dist-web is committed (base builds it into the repo) so inject() can read it.
  it("GET / → index.html; GET /demo → SPA fallback to index.html", async () => {
    const root = await call({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.headers["content-type"]).toContain("text/html");
    expect(root.body).toContain("<html");
    const demo = await call({ method: "GET", url: "/demo" });
    expect(demo.statusCode).toBe(200);
    expect(demo.headers["content-type"]).toContain("text/html");
  });
  it("GET /api/nonexistent → JSON 404 envelope (api-prefixed GETs never static-serve)", async () => {
    const r = await call({ method: "GET", url: "/api/nope" });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: { code: "NOT_FOUND", message: "route" } });
  });
  it("POST /not-an-api-route → JSON 404 (static serving is GET-only)", async () => {
    const r = await call({ method: "POST", url: "/whatever", role: "flag_admin", payload: {} });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("NOT_FOUND");
  });
  it.each(["/../server.ts", "/%2e%2e/server.ts", "/%2e%2e%2fapi%2fsrc%2fserver.ts"])(
    "traversal %s → cannot escape WEB_ROOT (404 or safe fallback)",
    async (url) => {
      const r = await call({ method: "GET", url });
      expect([200, 404]).toContain(r.statusCode); // 200 only via SPA index.html fallback
      if (r.statusCode === 200) expect(r.body).toContain("<html"); // never file contents
    },
  );
});

describe("GET /api/flags — list (F-01)", () => {
  it("lists seeded demo-* flags with per-env rows, viewer-readable", async () => {
    const r = await call({ method: "GET", url: "/api/flags" });
    expect(r.statusCode).toBe(200);
    const keys = r.json().flags.map((f: any) => `${f.key}@${f.env}`);
    for (const k of [
      "demo-checkout-v2@staging",
      "demo-hero@dev",
      "demo-hero@prod",
      "demo-new-nav@dev",
    ])
      expect(keys).toContain(k);
    for (const f of r.json().flags) expect(f.key).toMatch(/^demo-/); // synthetic only
  });
});

describe("POST /api/flags — create + RBAC (F-02, F-06)", () => {
  const matrix: { role: Role; env: string; want: number; note: string }[] = [
    { role: "none", env: "dev", want: 403, note: "unauthenticated → viewer → RBAC" },
    { role: "viewer", env: "dev", want: 403, note: "viewer cannot write" },
    { role: "flag_editor", env: "dev", want: 200, note: "editor writes non-prod" },
    { role: "flag_editor", env: "staging", want: 200, note: "editor writes non-prod" },
    { role: "flag_editor", env: "prod", want: 403, note: "editor blocked from prod" },
    { role: "flag_admin", env: "prod", want: 200, note: "admin writes prod" },
  ];
  it.each(matrix)("$role POST env=$env → $want ($note)", async ({ role, env, want }) => {
    const r = await call({
      method: "POST",
      url: "/api/flags",
      role,
      // DEMO_KEY law is lowercase/hyphens only — strip the flag_ prefix
      payload: { key: `demo-mtx-${role.replace("flag_", "")}-${env}`, env },
    });
    expect(r.statusCode).toBe(want);
    if (want === 200) {
      const { rows } = await pool.query(`SELECT 1 FROM flags WHERE key=$1 AND env=$2`, [
        `demo-mtx-${role.replace("flag_", "")}-${env}`,
        env,
      ]);
      expect(rows.length).toBe(1);
    }
  });

  it.each([
    { payload: { env: "dev" }, note: "missing key" },
    { payload: { key: "demo-x" }, note: "missing env" },
    { payload: { key: "demo-x", env: "qa" }, note: "env outside dev|staging|prod" },
  ])("rejects bad input → 400 BAD_INPUT ($note)", async ({ payload }) => {
    const r = await call({ method: "POST", url: "/api/flags", role: "flag_editor", payload });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({
      error: { code: "BAD_INPUT", message: "key + env(dev|staging|prod) required" },
    });
  });

  it.each([
    { key: "real-checkout", note: "real-looking key" },
    { key: "Demo-Upper", note: "uppercase rejected" },
    { key: "demo_under", note: "underscore rejected" },
  ])("non-synthetic key → 400 BAD_INPUT demo-* law ($note)", async ({ key }) => {
    const r = await call({
      method: "POST", url: "/api/flags", role: "flag_editor",
      payload: { key, env: "dev" },
    });
    expect(r.statusCode).toBe(400);
    const b = r.json();
    expect(b.error.code).toBe("BAD_INPUT");
    expect(b.error.message).toContain("demo-*");
    expect(b.error.message).toContain("Power Apps"); // constitutional copy
  });

  it("rejects malformed targeting JSON string → 400 BAD_TARGETING with actionable copy, no write (F-08)", async () => {
    const r = await call({
      method: "POST",
      url: "/api/flags",
      role: "flag_editor",
      payload: { key: "demo-bad-t", env: "dev", targeting: "{oops" },
    });
    expect(r.statusCode).toBe(400);
    const b = r.json();
    expect(b.error.code).toBe("BAD_TARGETING");
    expect(b.error.message).toContain("valid JSON"); // actionable copy
    const { rows } = await pool.query(`SELECT 1 FROM flags WHERE key='demo-bad-t'`);
    expect(rows.length).toBe(0);
  });

  it.each([
    { t: { enabled_if: { bucket_lt: -1 } }, note: "bucket_lt below 0" },
    { t: { enabled_if: { bucket_lt: 101 } }, note: "bucket_lt above 100" },
    { t: { enabled_if: { bucket_lt: "50" } }, note: "bucket_lt not a number" },
    { t: { enabled_if: 5 }, note: "enabled_if not an object" },
  ])("structurally invalid targeting → 400 BAD_TARGETING ($note)", async ({ t }) => {
    const r = await call({
      method: "POST", url: "/api/flags", role: "flag_editor",
      payload: { key: "demo-shape-t", env: "dev", targeting: t },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("BAD_TARGETING");
    const { rows } = await pool.query(`SELECT 1 FROM flags WHERE key='demo-shape-t'`);
    expect(rows.length).toBe(0); // never reached the db
  });

  it("accepts targeting passed as a JSON object", async () => {
    const r = await call({
      method: "POST",
      url: "/api/flags",
      role: "flag_editor",
      payload: { key: "demo-obj-t", env: "dev", targeting: { enabled_if: { bucket_lt: 10 } } },
    });
    expect(r.statusCode).toBe(200);
  });

  it("duplicate (key, env) create → 409 CONFLICT golden envelope, no second row, no audit (finding F-1)", async () => {
    const first = await call({
      method: "POST", url: "/api/flags", role: "flag_editor",
      payload: { key: "demo-dup", env: "dev", targeting: {} },
    });
    expect(first.statusCode).toBe(200);
    const r = await call({
      method: "POST", url: "/api/flags", role: "flag_editor",
      payload: { key: "demo-dup", env: "dev", targeting: {} },
    });
    expect(r.statusCode).toBe(409);
    const b = r.json();
    expect(b.error.code).toBe("CONFLICT");
    expect(b.error.message).toContain("demo-dup");
    const { rows } = await pool.query(`SELECT 1 FROM flags WHERE key='demo-dup'`);
    expect(rows.length).toBe(1);
    const { rows: auditRows } = await pool.query(
      `SELECT 1 FROM flag_audit_events a JOIN flags f ON f.id=a.flag_id WHERE f.key='demo-dup'`);
    expect(auditRows.length).toBe(1); // only the successful create audited
  });
});

describe("PUT /api/flags/:id — env scoping + targeting update (F-03, F-06)", () => {
  it("flips each env independently → writes only that env's row + audit (F-03)", async () => {
    const id = await flagId("demo-envscope", "dev");
    const r = await call({
      method: "PUT",
      url: `/api/flags/${id}`,
      role: "flag_editor",
      payload: { targeting: { default_enabled: true, probe: "dev-row-write" } },
    });
    expect(r.statusCode).toBe(200);
    const { rows: dev } = await pool.query(`SELECT targeting FROM flags WHERE id=$1`, [id]);
    expect(dev[0].targeting).toEqual({ default_enabled: true, probe: "dev-row-write" });
    // staging + prod rows of the same key untouched — env scoping is per-row:
    const { rows: others } = await pool.query(
      `SELECT env, targeting FROM flags WHERE key='demo-envscope' AND id <> $1 ORDER BY env`,
      [id],
    );
    for (const o of others) expect(o.targeting).toEqual({ default_enabled: false });
  });

  it.each([
    { role: "viewer" as Role, flagEnv: "dev", want: 403, note: "viewer cannot write" },
    { role: "flag_editor" as Role, flagEnv: "prod", want: 403, note: "editor blocked on prod flags" },
    { role: "flag_admin" as Role, flagEnv: "prod", want: 200, note: "admin writes prod" },
  ])("$role PUT env=$flagEnv → $want ($note)", async ({ role, flagEnv, want }) => {
    const id = await flagId("demo-rbac-put", flagEnv);
    const r = await call({
      method: "PUT",
      url: `/api/flags/${id}`,
      role,
      payload: { targeting: { default_enabled: true } },
    });
    expect(r.statusCode).toBe(want);
  });

  it("PUT missing flag → 404 NOT_FOUND envelope", async () => {
    const r = await call({
      method: "PUT",
      url: `/api/flags/${randomUUID()}`,
      role: "flag_admin",
      payload: { targeting: {} },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: { code: "NOT_FOUND", message: "flag" } });
  });

  it("PUT malformed targeting JSON → 400 BAD_TARGETING, row unchanged", async () => {
    const id = await flagId("demo-envscope", "staging");
    const r = await call({
      method: "PUT",
      url: `/api/flags/${id}`,
      role: "flag_editor",
      payload: { targeting: "{nah" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("BAD_TARGETING");
    const { rows } = await pool.query(`SELECT targeting FROM flags WHERE id=$1`, [id]);
    expect(rows[0].targeting).toEqual({ default_enabled: false });
  });
});

describe("DELETE /api/flags/:id — typed-confirm (F-04, F-06)", () => {
  it("flag_editor → 403 (admin-only)", async () => {
    const id = await flagId("demo-new-nav", "dev");
    const r = await call({
      method: "DELETE",
      url: `/api/flags/${id}?confirm=demo-new-nav`,
      role: "flag_editor",
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("RBAC");
  });

  it("mismatched confirm text → 400 CONFIRM_MISMATCH verbatim, row kept", async () => {
    const id = await flagId("demo-new-nav", "dev");
    const r = await call({
      method: "DELETE",
      url: `/api/flags/${id}?confirm=wrong-key`,
      role: "flag_admin",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({
      error: {
        code: "CONFIRM_MISMATCH",
        message: 'type the flag key "demo-new-nav" to confirm delete',
      },
    });
    const { rows } = await pool.query(`SELECT deleted FROM flags WHERE id=$1`, [id]);
    expect(rows[0].deleted).toBe(false);
  });

  it("missing confirm param → 400 CONFIRM_MISMATCH", async () => {
    const id = await flagId("demo-new-nav", "dev");
    const r = await call({ method: "DELETE", url: `/api/flags/${id}`, role: "flag_admin" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("CONFIRM_MISMATCH");
  });

  it("correct confirm → deleted + audit, gone from list, second delete 404s", async () => {
    const id = await flagId("demo-new-nav", "dev");
    const r = await call({
      method: "DELETE",
      url: `/api/flags/${id}?confirm=demo-new-nav`,
      role: "flag_admin",
      actor: "deleter-1",
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ demo: true, deleted: true });

    const list = await call({ method: "GET", url: "/api/flags" });
    expect(list.json().flags.map((f: any) => f.key)).not.toContain("demo-new-nav");

    const audit = await auditRows("delete");
    const row = audit.find((a) => a.flag_id === id);
    expect(row).toBeTruthy();
    expect(row.actor).toBe("deleter-1");
    expect(row.detail).toEqual({ key: "demo-new-nav" });
    expect(new Date(row.at).getTime()).toBeGreaterThan(0);

    const again = await call({
      method: "DELETE",
      url: `/api/flags/${id}?confirm=demo-new-nav`,
      role: "flag_admin",
    });
    expect(again.statusCode).toBe(404);
  });
});

describe("GET /api/flags/evaluate — deterministic bucket eval (F-07)", () => {
  it("same (key,userId) → same result on repeat calls", async () => {
    const url = "/api/flags/evaluate?key=demo-checkout-v2&userId=u-42&env=staging";
    const a = await call({ method: "GET", url });
    const b = await call({ method: "GET", url });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toEqual(b.json());
    expect(a.json()).toMatchObject({ demo: true, key: "demo-checkout-v2", env: "staging" });
    expect(typeof a.json().enabled).toBe("boolean");
    expect(a.json().reason).toBe("bucket(u-42)<25");
  });

  it("env param scopes which row answers", async () => {
    const dev = await call({
      method: "GET",
      url: "/api/flags/evaluate?key=demo-hero&userId=u-1&env=dev",
    });
    const prod = await call({
      method: "GET",
      url: "/api/flags/evaluate?key=demo-hero&userId=u-1&env=prod",
    });
    expect(dev.json()).toMatchObject({ enabled: true, env: "dev" });
    expect(prod.json()).toMatchObject({ enabled: false, env: "prod" });
  });

  it.each([
    { url: "/api/flags/evaluate?userId=u", note: "missing key" },
    { url: "/api/flags/evaluate?key=demo-hero", note: "missing userId" },
  ])("rejects → 400 BAD_INPUT ($note)", async ({ url }) => {
    const r = await call({ method: "GET", url });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: { code: "BAD_INPUT", message: "key + userId required" } });
  });

  it("unknown flag → 404 NOT_FOUND", async () => {
    const r = await call({ method: "GET", url: "/api/flags/evaluate?key=demo-nope&userId=u" });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("NOT_FOUND");
  });

  it("deleted flag → 404 after delete", async () => {
    const { rows } = await pool.query(
      `INSERT INTO flags (key,env,targeting) VALUES ('demo-gone','dev','{"default_enabled":true}') RETURNING id`,
    );
    await call({
      method: "DELETE",
      url: `/api/flags/${rows[0].id}?confirm=demo-gone`,
      role: "flag_admin",
    });
    const r = await call({ method: "GET", url: "/api/flags/evaluate?key=demo-gone&userId=u" });
    expect(r.statusCode).toBe(404);
  });
});

describe("GET /api/flags/audit — one row per mutation (F-05)", () => {
  it("create + update + delete each write an audit row with actor/action/detail/at", async () => {
    const creates = await auditRows("create");
    expect(creates.length).toBeGreaterThanOrEqual(4); // RBAC matrix + object-targeting creates
    const mtx = creates.find((a) => a.detail?.key === "demo-mtx-editor-dev");
    expect(mtx).toBeTruthy();
    expect(mtx.actor).toBe("ut-actor");
    expect(mtx.detail.env).toBe("dev");
    for (const a of creates) {
      expect(a.actor).toBeTruthy();
      expect(a.action).toBe("create");
      expect(a.detail).toBeTypeOf("object");
      expect(new Date(a.at).getTime()).toBeGreaterThan(0);
    }
    const updates = await auditRows("update");
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const deletes = await auditRows("delete");
    expect(deletes.length).toBeGreaterThanOrEqual(1);

    const r = await call({ method: "GET", url: "/api/flags/audit" });
    expect(r.statusCode).toBe(200);
    expect(r.json().demo).toBe(true);
    const actions = r.json().events.map((e: any) => e.action);
    for (const a of ["create", "update", "delete"]) expect(actions).toContain(a);
    for (const e of r.json().events) {
      expect(e.actor).toBeTruthy();
      expect(e.at).toBeTruthy();
    }
  });
});
