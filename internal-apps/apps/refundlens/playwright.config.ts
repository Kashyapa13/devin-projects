import { defineConfig } from "@playwright/test";

/**
 * RefundLens FT config (TESTING.md §FT).
 *
 * Runs against the dev stack this app's RUNBOOK prescribes:
 *   API  http://127.0.0.1:${FT_API_PORT:-8080}  (node dist/api/src/server.js)
 *   Web  http://127.0.0.1:${FT_WEB_PORT:-5174} (pnpm exec vite web --port 5174)
 * Bring them up first; global-setup mints the dev session token and
 * records storageState so every spec starts authenticated.
 *
 * Determinism: the same refund-seed-v1 dataset the integration tests
 * assert (5,432 events). Video on for the recorded-evidence mandate.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.FT_WEB_PORT
      ? `http://127.0.0.1:${process.env.FT_WEB_PORT}`
      : "http://127.0.0.1:5174",
    storageState: "e2e/.auth/state.json",
    video: "on",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results",
});
