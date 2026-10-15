import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { httpPlugin, type ReadinessDeps } from "@company/http";
import { sessionPlugin } from "@company/auth";
import type { FieldCipher } from "@company/crypto";
import type { Queryable } from "./services.js";
import { cipherFromEnv } from "./crypto.js";
import { registerRoutes } from "./routes.js";
import "./errors.js";

export interface ServerOptions {
  db: Queryable;
  cipher?: FieldCipher;
  /** HS256 session secret — vault in prod, fixture in tests. */
  sessionSecret?: string;
  cronSecret?: string;
  readiness?: ReadinessDeps;
}

export async function buildServer(
  opts: ServerOptions,
): Promise<FastifyInstance> {
  const sessionSecret = opts.sessionSecret ?? process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required (vault in prod)");
  }
  // TypeBox schemas validate via fastify's own ajv — no type provider needed.
  const app = Fastify({ logger: true });
  await app.register(httpPlugin, { readiness: opts.readiness ?? {} });
  await app.register(sessionPlugin, {
    secret: sessionSecret,
    issuer: process.env.SSO_ISSUER ?? "fastlane",
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
    cipher: opts.cipher ?? cipherFromEnv(),
    cronSecret: opts.cronSecret ?? process.env.CRON_SECRET ?? "dev-cron",
  });
  return app;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = await buildServer({
    db: pool,
    readiness: { db: () => pool.query("SELECT 1") },
  });
  await app.listen({
    port: Number(process.env.PORT ?? 8080),
    host: "0.0.0.0",
  });
}
