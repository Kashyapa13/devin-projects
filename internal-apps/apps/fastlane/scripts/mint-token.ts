/**
 * mint-token — dev/FT only: mint a session JWT identical to what
 * @company/auth's sessionPlugin issues (HS256, iss, 8h exp). Used by the
 * Playwright FT suite (localStorage "fastlane_token" dev SSO shim) — never
 * a prod path; prod tokens come from the IdP login flow.
 *
 * CLI: SESSION_SECRET=... pnpm exec tsx scripts/mint-token.ts <sub> <roles,csv>
 */
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64url");

export function mintToken(opts: {
  secret: string;
  sub: string;
  roles: string[];
  issuer?: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: opts.sub,
      roles: opts.roles,
      iss: opts.issuer ?? process.env.SSO_ISSUER ?? "fastlane",
      iat: now,
      exp: now + (opts.ttlSeconds ?? 8 * 3600),
    }),
  );
  const sig = createHmac("sha256", opts.secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [sub, rolesCsv] = process.argv.slice(2);
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  if (!sub || !rolesCsv) {
    throw new Error("usage: mint-token.ts <sub-uuid> <roles,csv>");
  }
  process.stdout.write(
    mintToken({ secret, sub, roles: rolesCsv.split(",") }),
  );
}
