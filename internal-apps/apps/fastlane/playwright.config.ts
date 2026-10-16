import { defineConfig } from "@playwright/test";

const API_PORT = Number(process.env.FT_API_PORT ?? 8080);
const WEB_PORT = Number(process.env.FT_WEB_PORT ?? 5173);
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/**
 * Functional tests — keyboard-mode only (constitution). Assumes:
 *   · Postgres up (docker compose <app>-pg), migrated + kyc-seed-v1 seeded
 *   · `pnpm build` already ran (webServer boots dist/server.js)
 * Env: DATABASE_URL, SESSION_SECRET, SSO_ISSUER?, CRON_SECRET?.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: WEB_URL,
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Interaction law: every FT runs twice — motion on, and frozen
  // (localStorage "motion-frozen"="1" planted by global-setup).
  projects: [
    {
      name: "chromium-motion-on",
      use: { browserName: "chromium", storageState: "e2e/.auth/state.json" },
    },
    {
      name: "chromium-motion-frozen",
      use: { browserName: "chromium", storageState: "e2e/.auth/state-frozen.json" },
    },
  ],
  webServer: [
    {
      command: "node dist/server.js",
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        SESSION_SECRET: process.env.SESSION_SECRET ?? "",
        SSO_ISSUER: process.env.SSO_ISSUER ?? "fastlane",
        CRON_SECRET: process.env.CRON_SECRET ?? "ft-cron",
        PORT: String(API_PORT),
      },
    },
    {
      command: `pnpm exec vite web --port ${WEB_PORT} --host 127.0.0.1 --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
