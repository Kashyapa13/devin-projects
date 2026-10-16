import { defineConfig } from "@playwright/test";

const API_PORT = Number(process.env.FT_API_PORT ?? 8082);
const WEB_PORT = Number(process.env.FT_WEB_PORT ?? 5183);
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/**
 * Functional tests for the flags capability demo (demo-spec F-01..F-09).
 * Assumes: Postgres up (`docker compose up flags-pg` or the session pg),
 * migrated + flags-seed-v1 seeded. webServer boots the API via tsx and the
 * vite dev server (its /api proxy targets :8082).
 * Two projects = the charter's both-motion-modes rule: normal + the
 * ADR-0014 reduced-motion path (prefers-reduced-motion).
 * Env: DATABASE_URL.
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
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "chromium-reduced-motion",
      use: { browserName: "chromium", reducedMotion: "reduce" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx api/src/server.ts",
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
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
