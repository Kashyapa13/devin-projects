import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mints the dev session JWT (scripts/dev-token.ts — the fixture path,
 * never a prod credential) and writes Playwright storageState so every
 * spec boots authenticated on the same deterministic session.
 */
export default async function globalSetup() {
  const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const token = execSync("pnpm -s dev-token", {
    cwd: appDir,
    env: {
      ...process.env,
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? "dev-session-secret-fixture-only",
    },
    encoding: "utf8",
  }).trim();

  const baseURL = process.env.FT_WEB_PORT
    ? `http://127.0.0.1:${process.env.FT_WEB_PORT}`
    : "http://127.0.0.1:5174";
  const authDir = join(appDir, "e2e", ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    join(authDir, "state.json"),
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: baseURL,
            localStorage: [{ name: "refundlens_token", value: token }],
          },
        ],
      },
      null,
      2,
    ),
  );
}
