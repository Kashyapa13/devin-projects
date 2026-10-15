import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

/**
 * `pnpm dev-token` — mint a local session JWT for browser/e2e work.
 * Dev fixture only: the prod path is SSO (SSO_ISSUER); this exists so
 * recordings and local runs can authenticate without an IdP.
 * Usage: TOKEN=$(pnpm -s dev-token) → localStorage 'refundlens_token'.
 */
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const secret =
    process.env.SESSION_SECRET ?? "dev-session-secret-fixture-only";
  const sub = process.argv.find((a) => a.startsWith("--sub="))?.split("=")[1] ??
    "analyst-0001";
  const roles =
    process.argv.find((a) => a.startsWith("--roles="))?.split("=")[1] ??
    "analyst";
  const token = await new SignJWT({ sub, roles: roles.split(",") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(process.env.SSO_ISSUER ?? "refundlens")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));
  console.log(token);
}
