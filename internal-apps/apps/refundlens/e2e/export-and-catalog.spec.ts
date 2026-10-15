import { expect, test } from "@playwright/test";

const API = process.env.FT_API_PORT
  ? `http://127.0.0.1:${process.env.FT_API_PORT}`
  : "http://127.0.0.1:8080";

const authHeaders = async (page: import("@playwright/test").Page) => {
  const token = await page.evaluate(() => localStorage.getItem("refundlens_token"));
  return { Authorization: `Bearer ${token}` };
};

/**
 * PR-promise: F-04 export — exact counts + watermark header comment.
 * PR-promise: F-09..F-17 skeleton catalog — the dashboard/live/monitors/
 * history routes are NOT implemented on this base; these specs record
 * that gap honestly (green = absent-yet-known, test.fails = the desired
 * end-state, flipping when the feature lane lands them).
 */
test.describe("export surface", () => {
  test("PR-promise:F-04 export.csv carries watermark comment + exact row count", async ({
    page,
  }) => {
    await page.goto("/");
    const res = await page.request.get(`${API}/api/v1/export.csv`, {
      headers: await authHeaders(page),
    });
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).toMatch(/^# refundlens export — watermark: 2\d\d\d-/);
    expect(csv).toContain("\nday,count\n");
    const footer = /# rows: (\d+)/.exec(csv);
    expect(footer).toBeTruthy();
    const dataRows = csv
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l !== "day,count");
    expect(dataRows.length).toBe(Number(footer![1]));
    // exact-count law: row count equals agg_daily's seeded span
    expect(dataRows.length).toBeGreaterThan(0);
  });

  test("export requires auth (401 without token)", async ({ page }) => {
    const res = await page.request.get(`${API}/api/v1/export.csv`);
    expect(res.status()).toBe(401);
  });
});

test.describe("skeleton catalog — F-09..F-17 not yet implemented", () => {
  // Desired end-state: these routes exist. They fail today — the
  // feature lane owns them; flip to test() when they land.
  for (const [name, path] of [
    ["GET /view (dashboard shell)", "/view"],
    ["GET /api/widgets/kpi", "/api/widgets/kpi"],
    ["GET /api/stream/heartbeat (live mode)", "/api/stream/heartbeat"],
    ["GET /monitors", "/monitors"],
    ["GET /api/v1/history (ask history)", "/api/v1/history"],
  ] as const) {
    test.fail(`PR-promise:F-09+ ${name} serves the surface`, async ({ page }) => {
      await page.goto("/");
      const res = await page.request.get(`${API}${path}`, {
        headers: await authHeaders(page),
      });
      expect(res.status()).toBe(200);
    });
  }

  test("unimplemented routes return the error envelope, not a stack trace", async ({
    page,
  }) => {
    await page.goto("/");
    const res = await page.request.get(`${API}/api/widgets/kpi`, {
      headers: await authHeaders(page),
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error?.code).toBe("NOT_FOUND");
  });
});
