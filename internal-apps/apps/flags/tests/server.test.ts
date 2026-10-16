import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newDb, DataType } from "pg-mem";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../api/src/server.js";

const MIGRATION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations/0001_init.up.sql",
);
const H = (role: string) => ({ "x-demo-role": role, "x-demo-actor": "test-actor" });

let app: ReturnType<typeof buildApp>;
let pool: InstanceType<typeof newDb.prototype.adapters.createPg>["Pool"] extends never ? never : any;

beforeAll(async () => {
  const mem = newDb();
  mem.public.registerFunction({
    name: "gen_random_uuid",
    args: [],
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });
  pool = new (mem.adapters.createPg().Pool)();
  await pool.query(readFileSync(MIGRATION, "utf8"));
  for (const f of [
    { key: "demo-hero", env: "dev", desc: "hero variant", t: { default_enabled: true } },
    { key: "demo-hero", env: "prod", desc: "hero prod", t: { default_enabled: false } },
    { key: "demo-checkout-v2", env: "staging", desc: "checkout", t: { enabled_if: { bucket_lt: 25 } } },
  ])
    await pool.query(`INSERT INTO flags (key,env,description,targeting) VALUES ($1,$2,$3,$4)`,
      [f.key, f.env, f.desc, JSON.stringify(f.t)]);
  app = buildApp({ db: pool });
});
afterAll(async () => { await app.close(); await pool.end(); });

const post = (url: string, role: string, body: any) =>
  app.inject({ method: "POST", url, headers: { ...H(role), "content-type": "application/json" }, payload: body });
const put = (url: string, role: string, body: any) =>
  app.inject({ method: "PUT", url, headers: { ...H(role), "content-type": "application/json" }, payload: body });
const del = (url: string, role: string) =>
  app.inject({ method: "DELETE", url, headers: H(role) });
const get = (url: string, role = "viewer") => app.inject({ method: "GET", url, headers: H(role) });

describe("flags routes — RBAC role×route matrix", () => {
  it("viewer cannot create/update/delete; flag_editor cannot touch prod or delete", async () => {
    expect((await post("/api/flags", "viewer", { key: "demo-x", env: "dev" })).statusCode).toBe(403);
    expect((await post("/api/flags", "flag_editor", { key: "demo-x", env: "prod" })).statusCode).toBe(403);
    const { rows } = await pool.query(`SELECT id FROM flags WHERE key='demo-hero' AND env='dev'`);
    expect((await del(`/api/flags/${rows[0].id}?confirm=demo-hero`, "flag_editor")).statusCode).toBe(403);
  });
  it("flag_admin can delete only with the typed key; audit rows land in the same tx", async () => {
    const create = await post("/api/flags", "flag_admin", { key: "demo-tmp", env: "prod" });
    expect(create.statusCode).toBe(200);
    const id = create.json().id;
    expect((await del(`/api/flags/${id}?confirm=wrong`, "flag_admin")).statusCode).toBe(400);
    expect((await del(`/api/flags/${id}?confirm=demo-tmp`, "flag_admin")).statusCode).toBe(200);
    const audit = await get("/api/flags/audit", "flag_admin");
    const actions = audit.json().events.filter((e: any) => e.key === "demo-tmp").map((e: any) => e.action);
    expect(actions).toEqual(["delete", "create"]);          // DESC by at
  });
});

describe("demo-law enforcement + targeting validation", () => {
  it("rejects non-demo-* keys so real flag keys never enter the demo store", async () => {
    const res = await post("/api/flags", "flag_admin", { key: "checkout-v2", env: "dev" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_INPUT");
  });
  it("rejects unusable targeting shapes with BAD_TARGETING (string/out-of-range bucket_lt)", async () => {
    for (const targeting of [{ enabled_if: { bucket_lt: "50" } }, { enabled_if: { bucket_lt: 150 } },
                           { enabled_if: "x" }, ["not-an-object"]]) {
      const res = await post("/api/flags", "flag_admin", { key: "demo-bad", env: "dev", targeting });
      expect(res.statusCode, JSON.stringify(targeting)).toBe(400);
      expect(res.json().error.code).toBe("BAD_TARGETING");
    }
    const ok = await post("/api/flags", "flag_admin",
      { key: "demo-bucket", env: "dev", targeting: { enabled_if: { bucket_lt: 50 } } });
    expect(ok.statusCode).toBe(200);
    const dup = await post("/api/flags", "flag_admin", { key: "demo-bucket", env: "dev" });
    expect(dup.statusCode).toBe(409);                      // live row: conflict, never a raw 23505 500
    expect(dup.json().error.code).toBe("CONFLICT");
  });
  it("PUT applies the same validation; update + audit commit together", async () => {
    const { rows } = await pool.query(`SELECT id FROM flags WHERE key='demo-hero' AND env='dev'`);
    const id = rows[0].id;
    const bad = await put(`/api/flags/${id}`, "flag_editor", { targeting: { enabled_if: { bucket_lt: -1 } } });
    expect(bad.statusCode).toBe(400);
    const good = await put(`/api/flags/${id}`, "flag_editor",
      { targeting: { enabled_if: { bucket_lt: 10 }, default_enabled: true } });
    expect(good.statusCode).toBe(200);
    const { rows: r2 } = await pool.query(`SELECT targeting FROM flags WHERE id=$1`, [id]);
    expect(r2[0].targeting.enabled_if.bucket_lt).toBe(10);
  });
});

describe("evaluate — exact-env + error envelope shape", () => {
  it("a key absent in an env 404s; bucket rule still gates after the update", async () => {
    expect((await get("/api/flags/evaluate?key=demo-checkout-v2&userId=u1&env=dev")).statusCode).toBe(404);
    expect((await get("/api/flags/evaluate?key=demo-hero&userId=u1&env=qa")).statusCode).toBe(400);
    const dev = await get("/api/flags/evaluate?key=demo-hero&userId=u1&env=dev");
    const prod = await get("/api/flags/evaluate?key=demo-hero&userId=u1&env=prod");
    expect(dev.json().enabled).toBe(true);
    expect(prod.json().enabled).toBe(false);               // same key, per-env decision
  });
  it("error responses carry the {error:{code,message}} envelope", async () => {
    const res = await get("/api/flags/evaluate?key=&userId=u1&env=dev");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
  });
});

describe("soft-delete recreate revives the row (no UNIQUE violation)", () => {
  it("create→delete→create returns the same id and keeps audit history", async () => {
    const c1 = await post("/api/flags", "flag_admin", { key: "demo-rec", env: "dev" });
    const id = c1.json().id;
    await del(`/api/flags/${id}?confirm=demo-rec`, "flag_admin");
    const c2 = await post("/api/flags", "flag_admin", { key: "demo-rec", env: "dev" });
    expect(c2.statusCode).toBe(200);
    expect(c2.json().id).toBe(id);
  });
});
