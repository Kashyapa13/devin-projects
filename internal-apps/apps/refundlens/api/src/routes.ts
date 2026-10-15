import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "@company/http";
import { requireRole } from "@company/auth";
import * as svc from "./service.js";

export interface RouteDeps {
  db: svc.Deps["db"];
  cache: svc.Deps["cache"];
  metrics: svc.Deps["metrics"];
}

/** The API registry — LLD's registry and openapi.yaml derive from this. */
export const REGISTRY = [
  { method: "POST", path: "/api/v1/ask", roles: ["analyst"], summary: "NL question → fenced SQL → {answer, sql, rows, watermark, took_ms}" },
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
