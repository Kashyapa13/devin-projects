import type { FastifyReply, FastifyRequest } from "fastify";
import type { IdTokenVerifier } from "./oidc.js";
import type { SessionUser } from "./roles.js";

/**
 * Fastify preHandler: verifies `Authorization: Bearer <id_token>` via the
 * supplied verifier and sets req.user = {sub, roles, ...claims}.
 */
export function bearerAuth(verify: IdTokenVerifier) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : undefined;
    if (!token) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "missing bearer token" },
      });
    }
    try {
      const claims = await verify(token);
      req.user = {
        sub: String(claims.sub ?? ""),
        roles: Array.isArray(claims.roles) ? (claims.roles as string[]) : [],
        ...claims,
      } satisfies SessionUser;
      return undefined;
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "invalid token" },
      });
    }
  };
}
