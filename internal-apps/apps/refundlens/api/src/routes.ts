import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "@company/http";
import { requireRole } from "@company/auth";
import * as svc from "./service.js";
import { currentWatermark } from "./watermark.js";
import { runWidget, type WidgetParams } from "./widgets.js";
import { FencedRejection } from "./ask/fence.js";

export interface RouteDeps {
  db: svc.Deps["db"];
  cache: svc.Deps["cache"];
  metrics: svc.Deps["metrics"];
}

/** The API registry — LLD's registry and openapi.yaml derive from this. */
export const REGISTRY = [
  { method: "POST", path: "/api/v1/ask", roles: ["analyst"], summary: "NL question → fenced SQL → {answer, sql, rows, watermark, took_ms}" },
  { method: "GET", path: "/api/v1/widgets/:name", roles: ["analyst"], summary: "Typed params → server-computed series through the same fenced layer (WIDGET LAW §4.2)" },
  { method: "GET", path: "/api/v1/health/sync", roles: ["analyst"], summary: "Watermark + lag + last run status — the freshness claim on every surface" },
  { method: "GET", path: "/api/v1/export.csv", roles: ["analyst"], summary: "Exact-count CSV export — watermark header, bypasses cache" },
  { method: "GET", path: "/metrics", roles: [], summary: "Prometheus text exposition (ops)" },
] as const;

const userOf = (req: FastifyRequest): svc.Actor => {
  const u = req.user;
  if (!u) throw new ApiError("UNAUTHORIZED", "authentication required", 401);
  return { sub: String(u.sub), roles: u.roles };
};

const reqId = (req: FastifyRequest): string => String(req.reqId ?? "");

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
    "/api/v1/widgets/:name",
    {
      schema: {
        params: Type.Object({ name: Type.String() }),
        querystring: Type.Object({
          from: Type.Optional(Type.String()),
          to: Type.Optional(Type.String()),
          grain: Type.Optional(
            Type.Union([Type.Literal("day"), Type.Literal("hour"), Type.Literal("minute")]),
          ),
          channel: Type.Optional(Type.String()),
          segment: Type.Optional(Type.String()),
          reason: Type.Optional(Type.String()),
          state: Type.Optional(Type.String()),
          compare: Type.Optional(Type.Union([Type.Literal("true"), Type.Literal("false")])),
          dim: Type.Optional(
            Type.Union([Type.Literal("channel"), Type.Literal("merchant_segment"), Type.Literal("reason_code")]),
          ),
          metric: Type.Optional(
            Type.Union([Type.Literal("count"), Type.Literal("amount"), Type.Literal("rate")]),
          ),
          sort: Type.Optional(
            Type.Union([Type.Literal("count"), Type.Literal("amount"), Type.Literal("rate")]),
          ),
          limit: Type.Optional(Type.String({ pattern: "^\\d{1,4}$" })),
          top: Type.Optional(Type.String({ pattern: "^\\d{1,2}$" })),
        }),
      },
      preHandler: requireRole("analyst"),
    },
    async (req) => {
      userOf(req);
      const { name } = req.params as { name: string };
      const q = req.query as Record<string, string | undefined>;
      const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
      const params: WidgetParams = {
        ...(q.from !== undefined ? { from: q.from } : {}),
        ...(q.to !== undefined ? { to: q.to } : {}),
        ...(q.grain !== undefined ? { grain: q.grain as WidgetParams["grain"] } : {}),
        ...(q.channel !== undefined ? { channel: q.channel } : {}),
        ...(q.segment !== undefined ? { segment: q.segment } : {}),
        ...(q.reason !== undefined ? { reason: q.reason } : {}),
        ...(q.state !== undefined ? { state: q.state } : {}),
        ...(q.compare !== undefined ? { compare: q.compare === "true" } : {}),
        ...(q.dim !== undefined ? { dim: q.dim as WidgetParams["dim"] } : {}),
        ...(q.metric !== undefined ? { metric: q.metric as WidgetParams["metric"] } : {}),
        ...(q.sort !== undefined ? { sort: q.sort as WidgetParams["sort"] } : {}),
        ...(num(q.limit) !== undefined ? { limit: num(q.limit) } : {}),
        ...(num(q.top) !== undefined ? { top: num(q.top) } : {}),
      };
      try {
        return await runWidget(deps.db, name, params);
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

  app.get(
    "/api/v1/health/sync",
    { preHandler: requireRole("analyst") },
    async (req) => {
      userOf(req);
      return currentWatermark(deps.db);
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

  app.get("/metrics", async () => deps.metrics.render());
}
