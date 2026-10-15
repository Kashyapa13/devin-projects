import { test, expect } from "@playwright/test";
import { FlagsPanelPage } from "./pages/FlagsPanelPage.js";
import { resetSeedFlags } from "./db.js";

/**
 * Eval + /demo suite — demo-spec F-07 + F-09. F-09 is the demo's critical
 * path (flip → /demo visibly changes live) and is recorded: its video is
 * the release evidence attached to the PR.
 * Deterministic on flags-seed-v1: demo-hero dev = default_enabled true.
 */

test.use({ video: "on" }); // record the critical path — F-09's video is release evidence

// Seed rows are shared state: restore them (and bust the eval cache) so a
// failed sibling spec can never hand us a flipped or tombstoned demo-hero.
test.beforeEach(async ({ request }) => {
  await resetSeedFlags(request);
});

test.describe("F-07 eval API — deterministic bucket, cached, labeled", () => {
  test("same (key,userId) → same result; response is demo-labeled", async ({
    request,
  }) => {
    const url = "/api/flags/evaluate?key=demo-checkout-v2&userId=u-7&env=staging";
    const a = await request.get(url);
    const b = await request.get(url);
    expect(a.status()).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    expect(a.headers()["x-demo-label"]).toContain("capability demo");
    const body = await a.json();
    expect(body.demo).toBe(true);
    expect(body.reason).toBe("bucket(u-7)<25");
  });

  test("env param scopes the answer (demo-hero dev on / prod off)", async ({
    request,
  }) => {
    const dev = await (
      await request.get("/api/flags/evaluate?key=demo-hero&userId=u-1&env=dev")
    ).json();
    const prod = await (
      await request.get("/api/flags/evaluate?key=demo-hero&userId=u-1&env=prod")
    ).json();
    expect(dev.enabled).toBe(true);
    expect(prod.enabled).toBe(false);
  });
});

test.describe("F-09 /demo flip — the critical path (recorded)", () => {
  test("flipping demo-hero flips the /demo section live, both directions", async ({
    page,
  }) => {
    const p = new FlagsPanelPage(page);
    await p.goto();
    await p.setRole("flag_editor");

    // Precondition: seeded demo-hero dev is ON for demo-user-1.
    await expect(p.demoSection).toContainText("HERO VARIANT", {
      timeout: 10_000,
    });
    await expect(p.demoSection).toContainText("flag is ON for demo-user-1");

    const row = p.flagRow("demo-hero", "dev");
    await p.flip(row);

    // The demo section re-evaluates after the mutation — visible flip, no reload.
    await expect(p.demoSection).toContainText("control — flag is off", {
      timeout: 10_000,
    });
    await expect(p.rowState(row)).toHaveText("off");

    // Flip back — restores the seeded state and proves the other direction.
    await p.flip(row);
    await expect(p.demoSection).toContainText("HERO VARIANT", {
      timeout: 10_000,
    });
    await expect(p.rowState(row)).toHaveText("on");
  });
});
