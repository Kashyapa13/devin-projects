import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import rateLimit from "@fastify/rate-limit";
import { ApiError, envelope, statusFor } from "./errors.js";

export const REQUEST_ID_HEADER = "x-request-id";

export interface ReadinessDeps {
  [name: string]: () => Promise<unknown>;
}

export interface HttpPluginOptions {
  /** readiness dependencies — e.g. { db: () => pool.query('SELECT 1'), kms: () => kms.ping() } */
  readiness?: ReadinessDeps;
}

declare module "fastify" {
  interface FastifyRequest {
    reqId: string;
  }
}

/**
 * Platform HTTP plugin: X-Request-ID threading, error envelope,
 * rate-limit support, healthz/readyz endpoints.
 */
export const httpPlugin = fp(
  async (app: FastifyInstance, opts: HttpPluginOptions) => {
  app.decorateRequest("reqId", "");

  app.addHook("onRequest", (req: FastifyRequest, reply: FastifyReply) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    req.reqId =
      typeof incoming === "string" && incoming.length > 0
        ? incoming
        : randomUUID();
    void reply.header(REQUEST_ID_HEADER, req.reqId);
    return Promise.resolve();
  });

  app.setErrorHandler(
    (err: Error, req: FastifyRequest, reply: FastifyReply) => {
      if (err instanceof ApiError) {
        return reply
          .status(err.statusCode)
          .send(envelope(err.code, err.message, req.reqId, err.detail));
      }
      const withStatus = err as Error & {
        statusCode?: number;
        code?: string;
      };
      if (withStatus.statusCode === 429) {
        return reply
          .status(429)
          .send(envelope("RATE_LIMITED", "rate limit exceeded", req.reqId));
      }
      if (typeof withStatus.statusCode === "number") {
        const code = withStatus.code ?? "HTTP_ERROR";
        return reply
          .status(withStatus.statusCode)
          .send(envelope(code, err.message, req.reqId));
      }
      req.log.error(err);
      return reply
        .status(500)
        .send(envelope("INTERNAL", "internal error", req.reqId));
    },
  );

  await app.register(rateLimit, { global: false });

  // healthz: process liveness, no dependencies.
  app.get("/healthz", () => ({ status: "ok" }));

  // readyz: every declared dependency must answer.
  app.get("/readyz", async (_req, reply) => {
    const deps = opts.readiness ?? {};
    const failing: string[] = [];
    for (const [name, check] of Object.entries(deps)) {
      try {
        await check();
      } catch {
        failing.push(name);
      }
    }
    if (failing.length > 0) {
      return reply
        .status(503)
        .send({ status: "not_ready", failing });
    }
    return { status: "ready" };
  });
  },
  { name: "@company/http" },
);
