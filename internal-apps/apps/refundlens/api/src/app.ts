import Fastify, { type FastifyInstance } from "fastify";
import { httpPlugin, type ReadinessDeps } from "@company/http";
import { sessionPlugin } from "@company/auth";
import { otelFastifyPlugin } from "@company/otel";
import type { Queryable } from "./ask/executor.js";
import { AnswerCache } from "./cache.js";
import { defaultMetrics } from "./service.js";
import type { DualRegistry } from "@company/otel";
import { registerRoutes } from "./routes.js";
import "./errors.js";

export interface ServerOptions {
  db: Queryable;
  /** HS256 session secret — vault in prod, fixture in tests. */
  sessionSecret?: string;
  cache?: AnswerCache;
  metrics?: DualRegistry;
  readiness?: ReadinessDeps;
}

export async function buildServer(
  opts: ServerOptions,
): Promise<FastifyInstance> {
  const sessionSecret = opts.sessionSecret ?? process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required (vault in prod)");
  }
  const app = Fastify({ logger: true });
  // @fastify/otel before routes/plugins — covers every route + hook with
  // zero module patching (ADR-0017). No SDK running → no-op tracer.
  await app.register(otelFastifyPlugin());
  await app.register(httpPlugin, { readiness: opts.readiness ?? {} });
  await app.register(sessionPlugin, {
    secret: sessionSecret,
    issuer: process.env.SSO_ISSUER ?? "refundlens",
  });

  // Bearer session → req.user; authorization stays per-route via requireRole.
  app.addHook("onRequest", async (req) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return;
    try {
      const payload = await app.session.verify(h.slice(7));
      req.user = {
        sub: String(payload.sub),
        roles: (payload.roles as string[]) ?? [],
      };
    } catch {
      // invalid token → req.user unset → requireRole emits 401
    }
  });

  registerRoutes(app, {
    db: opts.db,
    cache: opts.cache ?? new AnswerCache(),
    metrics: opts.metrics ?? defaultMetrics(),
  });
  return app;
}
