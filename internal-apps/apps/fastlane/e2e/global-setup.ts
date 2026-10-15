import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mintToken } from "../scripts/mint-token.js";

/**
 * Writes e2e/.auth/state.json — a Playwright storageState that plants the
 * reviewer session JWT in localStorage before any page loads (the dev SSO
 * shim; prod uses the IdP flow). Reviewer sub = kyc-seed-v1's r-reviewer.
 */
export default async function globalSetup(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for FT auth");
  const token = mintToken({
    secret,
    sub: "11111111-1111-1111-1111-111111111111",
    roles: ["reviewer"],
  });
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    ".auth",
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: `http://127.0.0.1:${process.env.FT_WEB_PORT ?? 5173}`,
          localStorage: [{ name: "fastlane_token", value: token }],
        },
      ],
    }),
  );
}
