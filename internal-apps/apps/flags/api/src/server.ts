import Fastify from "fastify";
import pg from "pg";
import { evaluateFlag, SwrCache } from "./eval.js";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ENVS = ["dev", "staging", "prod"] as const;
const LABEL = "capability demo — production continues on Power Apps"; // page/UI verbatim
const LABEL_HEADER = "capability demo - production continues on Power Apps"; // header-safe ASCII
const flagCache = new SwrCache(30_000, async (k) => {
  const { rows } = await db.query(`SELECT key, targeting, env FROM flags
    WHERE key = $1 AND deleted = false`, [k]); return rows;
});
const role = (h: any) => (h["x-demo-role"] as string) ?? "viewer";   // demo auth
const actor = (h: any) => (h["x-demo-actor"] as string) ?? "anon";

/** One tx per mutation: flag write + its audit row commit together or not at all. */
async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function audit(c: pg.PoolClient, flagId: string | null, actorName: string,
                     action: string, detail = {}) {
  await c.query(`INSERT INTO flag_audit_events (flag_id, actor, action, detail)
    VALUES ($1,$2,$3,$4)`, [flagId, actorName, action, JSON.stringify(detail)]);
}

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get("/healthz", () => ({ ok: true }));
  app.addHook("onSend", async (_req, reply) => { reply.header("x-demo-label", LABEL_HEADER); });

  app.get("/api/flags", async () => {
    const { rows } = await db.query(
      `SELECT id, key, description, targeting, env, created_at
       FROM flags WHERE deleted = false ORDER BY key, env`);
    return { demo: true, label: LABEL, flags: rows };
  });

  app.post("/api/flags", async (req, reply) => {
    if (!["flag_editor", "flag_admin"].includes(role(req.headers)))
      return reply.code(403).send({ error: { code: "RBAC", message: "flag_editor required" } });
    const b = req.body as { key?: string; description?: string; env?: string; targeting?: any };
    if (!b?.key || !ENVS.includes(b.env as any))
      return reply.code(400).send({ error: { code: "BAD_INPUT", message: "key + env(dev|staging|prod) required" } });
    if (b.env === "prod" && role(req.headers) !== "flag_admin")
      return reply.code(403).send({ error: { code: "RBAC", message: "flag_admin required for prod" } });
    let targeting = b.targeting ?? {};
    if (typeof targeting === "string") { try { targeting = JSON.parse(targeting); }
      catch { return reply.code(400).send({ error: { code: "BAD_TARGETING",
        message: "targeting must be valid JSON, e.g. {\"enabled_if\":{\"bucket_lt\":50}}" } }); } }
    const id = await withTx(async (c) => {
      // revive a soft-deleted row for the same (key,env) instead of violating UNIQUE
      const { rows: revived } = await c.query(
        `UPDATE flags SET deleted=false, description=$3, targeting=$4, created_at=now()
         WHERE key=$1 AND env=$2 AND deleted=true RETURNING id`,
        [b.key, b.env, b.description ?? "", JSON.stringify(targeting)]);
      let fid: string = revived[0]?.id;
      if (!fid) {
        const { rows } = await c.query(
          `INSERT INTO flags (key, description, env, targeting) VALUES ($1,$2,$3,$4) RETURNING id`,
          [b.key, b.description ?? "", b.env, JSON.stringify(targeting)]);
        fid = rows[0].id;
      }
      await audit(c, fid, actor(req.headers), "create", { key: b.key, env: b.env });
      return fid;
    });
    flagCache.invalidate(); return { demo: true, id };
  });

  app.put("/api/flags/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows: f } = await db.query(`SELECT env FROM flags WHERE id=$1 AND deleted=false`, [id]);
    if (!f.length) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "flag" } });
    if (f[0].env === "prod" && role(req.headers) !== "flag_admin")
      return reply.code(403).send({ error: { code: "RBAC", message: "flag_admin required for prod" } });
    if (!["flag_editor", "flag_admin"].includes(role(req.headers)))
      return reply.code(403).send({ error: { code: "RBAC", message: "flag_editor required" } });
    const b = req.body as { targeting?: any };
    let targeting = b?.targeting;
    if (typeof targeting === "string") { try { targeting = JSON.parse(targeting); }
      catch { return reply.code(400).send({ error: { code: "BAD_TARGETING",
        message: "invalid targeting JSON" } }); } }
    await withTx(async (c) => {
      if (targeting !== undefined)
        await c.query(`UPDATE flags SET targeting=$2 WHERE id=$1`, [id, JSON.stringify(targeting)]);
      await audit(c, id, actor(req.headers), "update", { targeting });
    });
    flagCache.invalidate(); return { demo: true, ok: true };
  });

  app.delete("/api/flags/:id", async (req, reply) => {
    if (role(req.headers) !== "flag_admin")
      return reply.code(403).send({ error: { code: "RBAC", message: "flag_admin required to delete" } });
    const { id } = req.params as { id: string };
    const { rows: f } = await db.query(`SELECT key FROM flags WHERE id=$1 AND deleted=false`, [id]);
    if (!f.length) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "flag" } });
    const typed = (req.query as { confirm?: string }).confirm;
    if (typed !== f[0].key)
      return reply.code(400).send({ error: { code: "CONFIRM_MISMATCH",
        message: `type the flag key "${f[0].key}" to confirm delete` } });
    await withTx(async (c) => {
      await c.query(`UPDATE flags SET deleted=true WHERE id=$1`, [id]);
      await audit(c, id, actor(req.headers), "delete", { key: f[0].key });
    });
    flagCache.invalidate(); return { demo: true, deleted: true };
  });

  app.get("/api/flags/evaluate", async (req, reply) => {
    const { key, userId, env = "dev" } = req.query as { key?: string; userId?: string; env?: string };
    if (!key || !userId) return reply.code(400).send({ error: { code: "BAD_INPUT", message: "key + userId required" } });
    if (!ENVS.includes(env as any)) return reply.code(400).send({ error: { code: "BAD_INPUT", message: "env must be dev|staging|prod" } });
    const flags = await flagCache.get(key) as any[];
    const flag = flags.find((x) => x.env === env);   // exact env — never another env's decision
    if (!flag) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "flag" } });
    return { demo: true, ...evaluateFlag(flag, userId), env: flag.env };
  });

  app.get("/api/flags/audit", async () => {
    const { rows } = await db.query(
      `SELECT a.id, a.actor, a.action, a.detail, a.at, f.key
       FROM flag_audit_events a LEFT JOIN flags f ON f.id = a.flag_id
       ORDER BY a.at DESC LIMIT 200`);
    return { demo: true, label: LABEL, events: rows };
  });
  return app;
}
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js"))
  buildApp().listen({ port: Number(process.env.PORT ?? 8082), host: "0.0.0.0" });
