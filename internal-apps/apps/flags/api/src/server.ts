import Fastify from "fastify";
import pg from "pg";
import path from "node:path";
import fsp from "node:fs/promises";
import { evaluateFlag, SwrCache } from "./eval.js";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ENVS = ["dev", "staging", "prod"] as const;
const LABEL = "capability demo — production continues on Power Apps"; // page/UI verbatim
const LABEL_HEADER = "capability demo - production continues on Power Apps"; // header-safe ASCII
const WEB_ROOT = path.join(process.cwd(), "dist-web");
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".ico": "image/x-icon", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};
const role = (h: any) => (h["x-demo-role"] as string) ?? "viewer";   // demo auth
const actor = (h: any) => (h["x-demo-actor"] as string) ?? "anon";

/** One tx per mutation: flag write + its audit row commit together or not at all. */
async function withTx<T>(pool: pg.Pool,
                         fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
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

/** Demo law: only synthetic demo-* keys — real flag keys never belong here (ADR-0002). */
const DEMO_KEY = /^demo-[a-z0-9][a-z0-9-]*$/;

/** null when the targeting shape is usable; a BAD_TARGETING message otherwise. */
function targetingError(t: any): string | null {
  if (t === undefined || t === null) return null;
  if (typeof t !== "object" || Array.isArray(t)) return "targeting must be a JSON object";
  if (t.enabled_if !== undefined) {
    const e = t.enabled_if;
    if (typeof e !== "object" || e === null || Array.isArray(e))
      return "enabled_if must be a JSON object";
    const b = e.bucket_lt;
    if (b !== undefined && (typeof b !== "number" || !Number.isFinite(b) || b < 0 || b > 100))
      return "enabled_if.bucket_lt must be a number from 0 to 100";
  }
  return null;
}

export function buildApp(deps: { db?: pg.Pool } = {}) {
  const pool = deps.db ?? db;
  const flagCache = new SwrCache(30_000, async (k) => {
    const { rows } = await pool.query(`SELECT key, targeting, env FROM flags
      WHERE key = $1 AND deleted = false`, [k]); return rows;
  });
  const app = Fastify({ logger: true });
  app.get("/healthz", () => ({ ok: true }));
  app.addHook("onSend", async (_req, reply) => { reply.header("x-demo-label", LABEL_HEADER); });

  /* The deployed unit serves the built web app too — / and /demo resolve
     here outside vite dev. /api/* keeps the JSON error envelope. */
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method !== "GET" || req.raw.url?.startsWith("/api/"))
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "route" } });
    const urlPath = decodeURIComponent((req.raw.url ?? "/").split("?")[0] ?? "/");
    const rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let file = path.join(WEB_ROOT, rel === "/" ? "index.html" : rel);
    if (!file.startsWith(WEB_ROOT)) file = path.join(WEB_ROOT, "index.html"); // traversal guard
    try { if ((await fsp.stat(file)).isDirectory()) file = path.join(WEB_ROOT, "index.html"); }
    catch { file = path.join(WEB_ROOT, "index.html"); } // SPA fallback
    try {
      const buf = await fsp.readFile(file);
      return reply.header("content-type", MIME[path.extname(file)] ?? "application/octet-stream").send(buf);
    } catch {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "route" } });
    }
  });

  app.get("/api/flags", async () => {
    const { rows } = await pool.query(
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
    if (!DEMO_KEY.test(b.key))
      return reply.code(400).send({ error: { code: "BAD_INPUT",
        message: "demo panel only accepts synthetic demo-* keys — production stays on Power Apps" } });
    if (b.env === "prod" && role(req.headers) !== "flag_admin")
      return reply.code(403).send({ error: { code: "RBAC", message: "flag_admin required for prod" } });
    let targeting = b.targeting ?? {};
    if (typeof targeting === "string") { try { targeting = JSON.parse(targeting); }
      catch { return reply.code(400).send({ error: { code: "BAD_TARGETING",
        message: "targeting must be valid JSON, e.g. {\"enabled_if\":{\"bucket_lt\":50}}" } }); } }
    const tErr = targetingError(targeting);
    if (tErr) return reply.code(400).send({ error: { code: "BAD_TARGETING", message: tErr } });
    let id: string;
    try {
      id = await withTx(pool, async (c) => {
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
    } catch (e: any) {
      if (e?.code === "23505")
        return reply.code(409).send({ error: { code: "CONFLICT",
          message: `flag "${b.key}" already exists in ${b.env} — use update or delete first` } });
      throw e;
    }
    flagCache.invalidate(); return { demo: true, id };
  });

  app.put("/api/flags/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows: f } = await pool.query(`SELECT env FROM flags WHERE id=$1 AND deleted=false`, [id]);
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
    const tErr = targetingError(targeting);
    if (tErr) return reply.code(400).send({ error: { code: "BAD_TARGETING", message: tErr } });
    await withTx(pool, async (c) => {
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
    const { rows: f } = await pool.query(`SELECT key FROM flags WHERE id=$1 AND deleted=false`, [id]);
    if (!f.length) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "flag" } });
    const typed = (req.query as { confirm?: string }).confirm;
    if (typed !== f[0].key)
      return reply.code(400).send({ error: { code: "CONFIRM_MISMATCH",
        message: `type the flag key "${f[0].key}" to confirm delete` } });
    await withTx(pool, async (c) => {
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
    const { rows } = await pool.query(
      `SELECT a.id, a.actor, a.action, a.detail, a.at, f.key
       FROM flag_audit_events a LEFT JOIN flags f ON f.id = a.flag_id
       ORDER BY a.at DESC LIMIT 200`);
    return { demo: true, label: LABEL, events: rows };
  });
  return app;
}
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js"))
  buildApp().listen({ port: Number(process.env.PORT ?? 8082), host: "0.0.0.0" });
