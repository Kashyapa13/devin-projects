import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

export const DEFAULT_SESSION_TTL_SECONDS = 8 * 3600; // 8h — fixed by constitution

export interface SessionPluginOptions {
  /** HS256 secret — from the vault, never hardcoded. */
  secret: string | Uint8Array;
  ttlSeconds?: number;
  issuer?: string;
}

export interface SessionManager {
  ttlSeconds: number;
  create(payload: Record<string, unknown>): Promise<string>;
  verify(token: string): Promise<JWTPayload>;
}

declare module "fastify" {
  interface FastifyInstance {
    session: SessionManager;
  }
}

/**
 * Session plugin: issues/verifies HS256 session JWTs, 8h TTL default.
 * App-side expiry is handled by jose (exp claim); a session token is a
 * signed assertion, not server state — revoke via issuer-side logout.
 */
export const sessionPlugin = fp(
  (app: FastifyInstance, opts: SessionPluginOptions) => {
  const key =
    typeof opts.secret === "string"
      ? new TextEncoder().encode(opts.secret)
      : opts.secret;
  const ttl = opts.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const issuer = opts.issuer ?? "internal-apps";

  const manager: SessionManager = {
    ttlSeconds: ttl,
    async create(payload) {
      return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer(issuer)
        .setExpirationTime(`${ttl}s`)
        .sign(key);
    },
    async verify(token) {
      const { payload } = await jwtVerify(token, key, { issuer });
      return payload;
    },
  };

  app.decorate("session", manager);
  return Promise.resolve();
  },
  { name: "@company/session" },
);
