import type { FastifyReply, FastifyRequest } from "fastify";

/** Role → permission matrix for the internal-tools program. */
export const rolesMatrix = {
  admin: ["*"],
  operator: ["case:read", "case:claim", "case:decide", "queue:read"],
  analyst: ["case:read", "queue:read", "report:read", "dashboard:read"],
  /** RefundLens (LLD role table, ADR-0018): dashboard read-only viewer. */
  ops: ["dashboard:read", "sync:read"],
  /** Machine callers — health checks, heartbeat beat posts (ADR-0018). */
  service: ["health:read", "beat:write"],
  viewer: ["case:read", "queue:read"],
  reviewer: [
    "case:read",
    "case:claim",
    "case:decide",
    "case:reveal",
    "queue:read",
  ],
  supervisor: [
    "case:read",
    "case:claim",
    "case:decide",
    "case:reveal",
    "case:reopen",
    "queue:read",
    "team:read",
    "audit:read",
  ],
} as const;

export type Role = keyof typeof rolesMatrix;

export interface SessionUser {
  sub: string;
  roles: string[];
  [claim: string]: unknown;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

/** Expand a user's roles into their effective permission set. */
export function permissionsOf(user: SessionUser): Set<string> {
  const out = new Set<string>();
  for (const role of user.roles) {
    const grants = rolesMatrix[role as Role];
    if (!grants) continue;
    for (const g of grants) out.add(g);
  }
  return out;
}

export function hasPermission(
  user: SessionUser,
  permission: string,
): boolean {
  const perms = permissionsOf(user);
  return perms.has("*") || perms.has(permission);
}

/**
 * Fastify preHandler: requires req.user (set by your auth hook) to hold
 * at least one of `roles`. 401 unauthenticated, 403 unauthorized —
 * server-side only, never client-side enforcement (constitution).
 */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user;
    if (!user) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "authentication required" },
      });
    }
    if (!user.roles.some((r) => (roles as string[]).includes(r))) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "insufficient role" },
      });
    }
    return undefined;
  };
}
