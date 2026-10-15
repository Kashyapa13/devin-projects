import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { httpPlugin, type ReadinessDeps } from "@company/http";

export interface ServerOptions {
  /** readiness deps probe e.g. { db: () => pool.query("SELECT 1") } */
  readiness?: ReadinessDeps;
}

/**
 * The template API: one health route via @company/http —
 * /healthz (liveness, no deps) and /readyz (all deps must answer).
 * Real routes register in api/routes/ per the API law in AGENTS.md.
 */
export async function buildServer(
  opts: ServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(httpPlugin, { readiness: opts.readiness ?? {} });
  return app;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = await buildServer({
    readiness: { db: () => pool.query("SELECT 1") },
  });
  await app.listen({
    port: Number(process.env.PORT ?? 8080),
    host: "0.0.0.0",
  });
}
