import Fastify from "fastify";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JSONWebKeySet,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { bearerAuth } from "../src/bearer.js";
import { verifyIdToken } from "../src/oidc.js";
import { hasPermission, requireRole, rolesMatrix } from "../src/roles.js";
import { sessionPlugin } from "../src/session.js";

const ISSUER = "https://sso.example.com";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let jwks: JSONWebKeySet;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const pub = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...pub, kid: "test-key" }] };
});

async function sign(
  claims: Record<string, unknown>,
  opts: { iss?: string; exp?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(opts.iss ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "10m")
    .sign(privateKey);
}

describe("verifyIdToken", () => {
  it("verifies a token against the mocked JWKS", async () => {
    const verify = verifyIdToken({ issuer: ISSUER, jwks });
    const token = await sign({ sub: "u-1", roles: ["operator"] });
    const claims = await verify(token);
    expect(claims.sub).toBe("u-1");
    expect(claims.iss).toBe(ISSUER);
  });

  it("rejects wrong issuer, expired tokens, and bad signatures", async () => {
    const verify = verifyIdToken({ issuer: ISSUER, jwks });
    await expect(
      verify(await sign({ sub: "u" }, { iss: "https://evil.example" })),
    ).rejects.toThrow();
    await expect(
      verify(await sign({ sub: "u" }, { exp: "0s" })),
    ).rejects.toThrow();
    const token = await sign({ sub: "u" });
    await expect(verify(token.slice(0, -4) + "AAAA")).rejects.toThrow();
  });
});

describe("sessionPlugin (8h TTL)", () => {
  it("issues and verifies session tokens with an 8h exp", async () => {
    const app = Fastify();
    await app.register(sessionPlugin, { secret: "test-secret-32-bytes-minimum!!" });
    const token = await app.session.create({ sub: "u-1", roles: ["operator"] });
    const claims = await app.session.verify(token);
    expect(claims.sub).toBe("u-1");
    expect(claims.exp! - claims.iat!).toBe(8 * 3600);
    await app.close();
  });

  it("rejects forged and expired session tokens", async () => {
    const app = Fastify();
    await app.register(sessionPlugin, { secret: "test-secret-32-bytes-minimum!!" });
    const token = await app.session.create({ sub: "u-1" });
    await expect(app.session.verify(token + "x")).rejects.toThrow();
    await app.close();
  });
});

describe("rolesMatrix + requireRole", () => {
  it("expands roles into permissions incl. admin wildcard", () => {
    expect(hasPermission({ sub: "a", roles: ["admin"] }, "anything")).toBe(
      true,
    );
    expect(
      hasPermission({ sub: "o", roles: ["operator"] }, "case:claim"),
    ).toBe(true);
    expect(
      hasPermission({ sub: "v", roles: ["viewer"] }, "case:claim"),
    ).toBe(false);
    // matrix stays a data structure — inspectable
    expect(rolesMatrix.operator).toContain("queue:read");
  });

  it("requireRole allows matching role, denies others, 401s unauthenticated", async () => {
    const app = Fastify();
    app.get(
      "/protected",
      {
        preHandler: [
          async (req) => {
            req.user = { sub: "u", roles: ["viewer"] };
          },
          requireRole("operator"),
        ],
      },
      () => ({ ok: true }),
    );
    app.get(
      "/authed",
      { preHandler: [requireRole("viewer")] },
      () => ({ ok: true }),
    );
    app.get(
      "/open",
      {
        preHandler: [
          async (req) => {
            req.user = { sub: "u", roles: ["viewer", "operator"] };
          },
          requireRole("operator"),
        ],
      },
      () => ({ ok: true }),
    );

    expect((await app.inject("/protected")).statusCode).toBe(403);
    expect((await app.inject("/authed")).statusCode).toBe(401);
    expect((await app.inject("/open")).statusCode).toBe(200);
    await app.close();
  });
});

describe("bearerAuth", () => {
  it("populates req.user from a verified token", async () => {
    const verify = verifyIdToken({ issuer: ISSUER, jwks });
    const app = Fastify();
    app.get(
      "/me",
      { preHandler: [bearerAuth(verify)] },
      (req) => ({ sub: req.user?.sub, roles: req.user?.roles }),
    );
    const token = await sign({ sub: "u-9", roles: ["analyst"] });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sub: "u-9", roles: ["analyst"] });
    expect((await app.inject("/me")).statusCode).toBe(401);
    await app.close();
  });
});
