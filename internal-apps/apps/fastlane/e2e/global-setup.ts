import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { runSeeds } from "@company/testing";
import { mintToken } from "../scripts/mint-token.js";
import { makeRegistry } from "../scripts/seed.js";
import { cipherFromEnv } from "../api/src/crypto.js";

/**
 * Writes e2e/.auth/state{,-frozen}.json — Playwright storageStates that
 * plant the reviewer session JWT (dev SSO shim) in localStorage; the
 * frozen variant adds the Interaction-law motion flag. Reviewer sub =
 * kyc-seed-v1's r-reviewer.
 *
 * Also RESEEDS kyc-seed-v1 (200 cases) when DATABASE_URL is set: decisions
 * consume PENDING rows, so each run must start from the deterministic
 * fixture, not whatever the last run left behind.
 */
export default async function globalSetup(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for FT auth");
  const dsn = process.env.DATABASE_URL;
  if (dsn) {
    const pool = new Pool({ connectionString: dsn });
    try {
      await runSeeds(pool, makeRegistry(cipherFromEnv(), 200), "kyc-seed-v1");
    } finally {
      await pool.end();
    }
  }
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
  const state = (motionFrozen: boolean) => ({
    cookies: [],
    origins: [
      {
        origin: `http://127.0.0.1:${process.env.FT_WEB_PORT ?? 5173}`,
        localStorage: [
          { name: "fastlane_token", value: token },
          // Interaction-law test flag: MotionProvider reads
          // localStorage "motion-frozen" === "1" → reducedMotion "always".
          ...(motionFrozen ? [{ name: "motion-frozen", value: "1" }] : []),
        ],
      },
    ],
  });
  writeFileSync(join(dir, "state.json"), JSON.stringify(state(false)));
  writeFileSync(join(dir, "state-frozen.json"), JSON.stringify(state(true)));
}
