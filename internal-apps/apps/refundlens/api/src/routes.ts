import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "@company/http";
import { requireRole } from "@company/auth";
import * as svc from "./service.js";
import { runWidget, type WidgetParams } from "./widgets.js";
import { FencedRejection } from "./ask/fence.js";
import {
  getLatestBeat,
  recordBeat,
  snapshotBeat,
  subscribeBeat,
  type HeartbeatBeat,
} from "./live.js";
import { currentWatermark } from "./watermark.js";

export interface RouteDeps {
  db: svc.Deps["db"];
  cache: svc.Deps["cache"];
  metrics: svc.Deps["metrics"];
}

/** The API registry — LLD's registry and openapi.yaml derive from this. */
export const REGISTRY = [
  { method: "POST", path: "/api/v1/ask", roles: ["analyst"], summary: "NL question → fenced SQL → {answer, sql, rows, watermark, took_ms}" },
  { method: "GET", path: "/api/v1/export.csv", roles: ["analyst"], summary: "Exact-count CSV export — watermark header, bypasses cache" },
  { method: "GET", path: "/api/widgets/:name", roles: ["analyst", "ops"], summary: "Dashboard widget — typed params → server-rendered → fenced exec (WIDGET LAW)" },
  { method: "GET", path: "/api/stream/heartbeat", roles: ["analyst", "ops"], summary: "SSE — heartbeat beats {watermark,last_event_at,beat_at,rows,lag_s} (ADR-0016)" },
  { method: "POST", path: "/api/internal/beat", roles: ["service"], summary: "Heartbeat script posts each beat — records + fans out to SSE (never silent)" },
  { method: "GET", path: "/api/monitors", roles: ["admin"], summary: "Monitors-as-code definitions + latest state (admin)" },
  { method: "PATCH", path: "/api/monitors/:id", roles: ["admin"], summary: "Enable/disable/update a monitor — bumps version" },
  { method: "GET", path: "/api/v1/health/sync", roles: ["analyst", "ops", "service"], summary: "Watermark + lag + last run status + heartbeat age (F-06)" },
  { method: "GET", path: "/api/v1/sync", roles: ["admin"], summary: "Sync admin surface — sync_runs history + heartbeat age (F-17)" },
  { method: "GET", path: "/metrics", roles: [], summary: "Prometheus text exposition (ops)" },
] as const;

const userOf = (req: FastifyRequest): svc.Actor => {
  const u = req.user;
  if (!u) throw new ApiError("UNAUTHORIZED", "authentication required", 401);
  return { sub: String(u.sub), roles: u.roles };
};

const reqId = (req: FastifyRequest): string => String(req.reqId ?? "");

/** Query-param → typed WidgetParams (WIDGET LAW: typed params only). */
function widgetParams(q: Record<string, unknown>): WidgetParams {
  const str = (k: string): string | undefined =>
    typeof q[k] === "string" && q[k] !== "" ? (q[k] as string) : undefined;
  const int = (k: string): number | undefined => {
    const v = str(k);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n)) {
      throw new ApiError("VALIDATION", `param ${k} must be an integer`, 400);
    }
    return n;
  };
  const cmp = str("compare");
  return {
    ...(str("from") ? { from: str("from") } : {}),
    ...(str("to") ? { to: str("to") } : {}),
    ...(str("grain") ? { grain: str("grain") as WidgetParams["grain"] } : {}),
    ...(str("channel") ? { channel: str("channel") } : {}),
    ...(str("segment") ? { segment: str("segment") } : {}),
    ...(str("reason") ? { reason: str("reason") } : {}),
    ...(str("state") ? { state: str("state") } : {}),
    ...(str("dim") ? { dim: str("dim") as WidgetParams["dim"] } : {}),
    ...(str("metric") ? { metric: str("metric") as WidgetParams["metric"] } : {}),
    ...(str("sort") ? { sort: str("sort") as WidgetParams["sort"] } : {}),
    ...(int("limit") !== undefined ? { limit: int("limit") } : {}),
    ...(int("top") !== undefined ? { top: int("top") } : {}),
    ...(cmp ? { compare: ["1", "true", "yes"].includes(cmp) } : {}),
  };
}

interface Row {
  rows: Record<string, unknown>[];
}
const rowsOf = (r: unknown): Record<string, unknown>[] => (r as Row).rows ?? [];

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const svcDeps: svc.Deps = { db: deps.db, cache: deps.cache, metrics: deps.metrics };

  app.post(
    "/api/v1/ask",
    {
      schema: {
        body: Type.Object({ question: Type.String({ minLength: 1, maxLength: 500 }) }),
      },
      preHandler: requireRole("analyst"),
    },
    async (req) => {
      const { question } = req.body as { question: string };
      return svc.ask(svcDeps, userOf(req), question, reqId(req));
    },
  );

  app.get(
    "/api/v1/export.csv",
    { preHandler: requireRole("analyst") },
    async (req, reply) => {
      const { csv } = await svc.exportCsv(svcDeps, userOf(req), reqId(req));
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="refundlens-export.csv"')
        .send(csv);
    },
  );

  /** WIDGET LAW — typed params only; fenced rejections share the ask
   *  envelope so a blocked widget never becomes a best effort. */
  app.get(
    "/api/widgets/:name",
    {
      schema: {
        params: Type.Object({ name: Type.String({ maxLength: 40 }) }),
        querystring: Type.Object(
          {},
          { additionalProperties: true },
        ),
      },
      preHandler: requireRole("analyst", "ops"),
    },
    async (req) => {
      const { name } = req.params as { name: string };
      const p = widgetParams(req.query as Record<string, unknown>);
      try {
        return await runWidget(deps.db, name, p);
      } catch (e) {
        if (e instanceof FencedRejection) {
          deps.metrics.counter("fence_rejected_total").inc(1, { reason: e.reason });
          throw new ApiError("FENCED_QUERY_REJECTED", e.message, 400, {
            reason: e.reason,
            guidance: e.guidance,
          });
        }
        throw e;
      }
    },
  );

  /**
   * SSE heartbeat stream (ADR-0016). EventSource cannot set headers, so
   * this route ALSO accepts the session JWT as ?token= — the same
   * signature verification, same roles; Bearer stays primary everywhere.
   */
  app.get(
    "/api/stream/heartbeat",
    {
      schema: {
        querystring: Type.Object(
          { token: Type.Optional(Type.String({ maxLength: 4096 })) },
          { additionalProperties: true },
        ),
      },
      preHandler: async (req, reply) => {
        if (!req.user) {
          const tok = (req.query as Record<string, unknown>)["token"];
          if (typeof tok === "string" && tok) {
            try {
              const payload = await app.session.verify(tok);
              req.user = { sub: String(payload.sub), roles: (payload.roles as string[]) ?? [] };
            } catch {
              // fall through to requireRole's 401
            }
          }
        }
        return requireRole("analyst", "ops")(req, reply);
      },
    },
    async (req, reply) => {
      await reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      const send = (b: HeartbeatBeat) => {
        reply.raw.write(`data: ${JSON.stringify(b)}\n\n`);
      };
      send(getLatestBeat() ?? (await snapshotBeat(deps.db)));
      const unsub = subscribeBeat(send);
      const keepalive = setInterval(() => reply.raw.write(`: ka\n\n`), 25_000);
      req.raw.on("close", () => {
        clearInterval(keepalive);
        unsub();
      });
    },
  );

  /** The heartbeat script's one inbound call — records the beat and fans
   *  it out to SSE clients. Service role; body is the beat verbatim. */
  app.post(
    "/api/internal/beat",
    {
      schema: {
        body: Type.Object({
          watermark: Type.Union([Type.String(), Type.Null()]),
          last_event_at: Type.Union([Type.String(), Type.Null()]),
          beat_at: Type.String(),
          rows: Type.Integer({ minimum: 0 }),
          lag_s: Type.Union([Type.Integer(), Type.Null()]),
          status: Type.Union([Type.Literal("ok"), Type.Literal("degraded")]),
          detail: Type.Optional(Type.String({ maxLength: 1000 })),
        }),
      },
      preHandler: requireRole("service"),
    },
    async (req) => {
      const beat = req.body as HeartbeatBeat;
      recordBeat(beat);
      return { recorded: true, beat_at: beat.beat_at };
    },
  );

  app.get(
    "/api/monitors",
    { preHandler: requireRole("admin") },
    async () => ({
      monitors: rowsOf(
        await deps.db.query(
          `SELECT m.id, m.name, m.metric, m."window", m.condition, m.threshold,
                  m.severity, m.owner, m.channel, m.enabled, m.version, m.updated_at,
                  (SELECT e.state FROM refundlens.monitor_events e
                    WHERE e.monitor_id = m.id ORDER BY e.fired_at DESC LIMIT 1) AS state,
                  (SELECT e.fired_at FROM refundlens.monitor_events e
                    WHERE e.monitor_id = m.id ORDER BY e.fired_at DESC LIMIT 1) AS last_fired_at
             FROM refundlens.monitors m ORDER BY m.name`,
        ),
      ),
    }),
  );

  app.patch(
    "/api/monitors/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String({ format: "uuid" }) }),
        body: Type.Object(
          {
            enabled: Type.Optional(Type.Boolean()),
            threshold: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
            severity: Type.Optional(
              Type.Union([Type.Literal("page"), Type.Literal("ticket"), Type.Literal("info")]),
            ),
            owner: Type.Optional(Type.String({ maxLength: 200 })),
            channel: Type.Optional(Type.String({ maxLength: 50 })),
            window: Type.Optional(Type.String({ maxLength: 20 })),
            metric: Type.Optional(Type.String({ maxLength: 60 })),
            condition: Type.Optional(
              Type.Union([
                Type.Literal("gt"),
                Type.Literal("lt"),
                Type.Literal("zscore_gt"),
                Type.Literal("age_gt"),
              ]),
            ),
          },
          { minProperties: 1 },
        ),
      },
      preHandler: requireRole("admin"),
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as Record<string, unknown>;
      const fields: Record<string, string> = {
        enabled: "enabled",
        threshold: "threshold",
        severity: "severity",
        owner: "owner",
        channel: "channel",
        window: '"window"',
        metric: "metric",
        condition: "condition",
      };
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [k, col] of Object.entries(fields)) {
        if (b[k] === undefined) continue;
        params.push(k === "threshold" ? JSON.stringify(b[k]) : b[k]);
        sets.push(`${col} = $${params.length}`);
      }
      const res = rowsOf(
        await deps.db.query(
          `UPDATE refundlens.monitors
             SET ${sets.join(", ")}, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING id, name, metric, "window", condition, threshold,
                     severity, owner, channel, enabled, version, updated_at`,
          params,
        ),
      );
      if (res.length === 0) {
        throw new ApiError("NOT_FOUND", `no monitor ${id}`, 404);
      }
      return { monitor: res[0] };
    },
  );

  /** F-06 — sync health: watermark + lag + last run + heartbeat age. */
  app.get(
    "/api/v1/health/sync",
    { preHandler: requireRole("analyst", "ops", "service") },
    async () => {
      const wm = await currentWatermark(deps.db);
      const beat = getLatestBeat();
      return {
        ...wm,
        heartbeat: beat
          ? { beat_at: beat.beat_at, status: beat.status, age_s: Math.max(0, Math.floor((Date.now() - new Date(beat.beat_at).getTime()) / 1000)) }
          : null,
      };
    },
  );

  /** F-17 — admin sync surface: recent sync_runs + heartbeat age. */
  app.get(
    "/api/v1/sync",
    { preHandler: requireRole("admin") },
    async () => {
      const beat = getLatestBeat();
      return {
        runs: rowsOf(
          await deps.db.query(
            `SELECT id, watermark, watermark_id, rows, status, detail,
                    started_at, finished_at
               FROM refundlens.sync_runs ORDER BY id DESC LIMIT 50`,
          ),
        ),
        heartbeat: beat
          ? { beat_at: beat.beat_at, status: beat.status, age_s: Math.max(0, Math.floor((Date.now() - new Date(beat.beat_at).getTime()) / 1000)) }
          : null,
      };
    },
  );

  app.get("/metrics", async () => deps.metrics.render());
}
