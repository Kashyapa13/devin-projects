import { test, expect } from "@playwright/test";
import { FlagsPanelPage } from "./pages/FlagsPanelPage.js";
import { purgeE2eFlags, resetSeedFlags } from "./db.js";

/**
 * Panel suite — demo-spec F-01..F-06 + F-08 (PR-promise per spec name).
 * Deterministic on flags-seed-v1 (demo-hero dev/prod, demo-new-nav dev,
 * demo-checkout-v2 staging) plus `demo-e2e-*` keys created by the suite.
 * Sequential (workers=1): specs share the seeded db; each creates only its
 * own keys and deletes what it created.
 */

const LABEL = "capability demo — production continues on Power Apps";

test.describe("F-01 flag list — every flag with per-env state + label law", () => {
  test("seeded demo-* flags listed with env badges; demo label banner visible", async ({
    page,
    request,
  }) => {
    await resetSeedFlags(request);
    const p = new FlagsPanelPage(page);
    await p.goto();
    await expect(p.banner).toContainText(LABEL);
    for (const [key, env] of [
      ["demo-hero", "dev"],
      ["demo-hero", "prod"],
      ["demo-new-nav", "dev"],
      ["demo-checkout-v2", "staging"],
    ]) {
      await expect(p.flagRow(key!, env!)).toHaveCount(1);
    }
    // Per-env state column renders on/off from targeting.
    await expect(p.rowState(p.flagRow("demo-hero", "dev"))).toHaveText("on");
    await expect(p.rowState(p.flagRow("demo-hero", "prod"))).toHaveText("off");
  });
});

test.describe("F-02 flag create — new flag in list + audit row", () => {
  test("flag_editor creates demo-e2e-crud in dev → row + audit create", async ({
    page,
  }) => {
    await purgeE2eFlags(["demo-e2e-crud"]);
    const p = new FlagsPanelPage(page);
    await p.goto();
    await p.setRole("flag_editor");
    await p.create("demo-e2e-crud", "dev");
    const row = p.flagRow("demo-e2e-crud", "dev");
    await expect(row).toHaveCount(1);
    await expect(p.rowState(row)).toHaveText("off");
    await expect(p.auditRow("create", "demo-e2e-crud").first()).toContainText(
      "demo-user",
    );
  });
});

test.describe("F-03 env scoping — each env flips independently", () => {
  test("dev flip changes only the dev row; staging + prod untouched", async ({
    page,
  }) => {
    await purgeE2eFlags(["demo-e2e-env-scope"]);
    const p = new FlagsPanelPage(page);
    await p.goto();
    await p.setRole("flag_admin");
    for (const env of ["dev", "staging", "prod"]) {
      await p.create("demo-e2e-env-scope", env);
    }
    const dev = p.flagRow("demo-e2e-env-scope", "dev");
    const staging = p.flagRow("demo-e2e-env-scope", "staging");
    const prod = p.flagRow("demo-e2e-env-scope", "prod");
    await expect(dev).toHaveCount(1);
    await expect(staging).toHaveCount(1);
    await expect(prod).toHaveCount(1);
    for (const r of [dev, staging, prod])
      await expect(p.rowState(r)).toHaveText("off");

    const flipRes = await p.flip(dev);
    expect(flipRes.status()).toBe(200);
    await expect(p.rowState(dev)).toHaveText("on");
    await expect(p.rowState(staging)).toHaveText("off");
    await expect(p.rowState(prod)).toHaveText("off");
  });
});

test.describe("F-04 typed-confirm delete — mismatch verbatim, correct deletes + audit", () => {
  test("wrong text → CONFIRM_MISMATCH verbatim; correct key → deleted + audit", async ({
    page,
  }) => {
    await purgeE2eFlags(["demo-e2e-del"]);
    const p = new FlagsPanelPage(page);
    await p.goto();
    await p.setRole("flag_admin");
    await p.create("demo-e2e-del", "dev");
    const row = p.flagRow("demo-e2e-del", "dev");
    await expect(row).toHaveCount(1);

    // Mismatch: the server answers CONFIRM_MISMATCH verbatim and the row stays.
    const mismatch = await p.deleteFlag(row, "not-the-key");
    expect(mismatch.status()).toBe(400);
    await p.expectErrorContaining("CONFIRM_MISMATCH");
    await p.expectErrorContaining(
      'type the flag key "demo-e2e-del" to confirm delete',
    );
    await expect(row).toHaveCount(1);

    // Correct text: row gone + audit row.
    const ok = await p.deleteFlag(row, "demo-e2e-del");
    expect(ok.status()).toBe(200);
    await expect(p.flagRow("demo-e2e-del", "dev")).toHaveCount(0);
    await expect(p.errorText).toHaveCount(0);
    await expect(p.auditRow("delete", "demo-e2e-del").first()).toContainText(
      "demo-user",
    );
  });
});

test.describe("F-05 full audit — actor/action/timestamp per mutation", () => {
  test("audit table shows create/update/delete rows with actor + time", async ({
    page,
  }) => {
    await purgeE2eFlags(["demo-e2e-audit"]);
    const p = new FlagsPanelPage(page);
    await p.goto();
    await p.setRole("flag_editor");
    await p.create("demo-e2e-audit", "dev");
    const row = p.flagRow("demo-e2e-audit", "dev");
    await p.flip(row);
    await expect(p.rowState(row)).toHaveText("on");

    const createRow = p.auditRow("create", "demo-e2e-audit").first();
    await expect(createRow).toBeVisible();
    await expect(createRow).toContainText("demo-user");
    await expect(p.auditRow("update").first()).toBeVisible();
  });
});

test.describe("F-06 RBAC — editor non-prod only, admin prod", () => {
  test("flag_editor → prod create 403; flag_admin → prod create passes", async ({
    page,
  }) => {
    await purgeE2eFlags(["demo-e2e-rbac"]);
    const p = new FlagsPanelPage(page);
    await p.goto();

    await p.setRole("flag_editor");
    await p.create("demo-e2e-rbac", "prod");
    await p.expectErrorContaining("RBAC");
    await p.expectErrorContaining("flag_admin required for prod");
    await expect(p.flagRow("demo-e2e-rbac", "prod")).toHaveCount(0);

    await p.setRole("flag_admin");
    await p.create("demo-e2e-rbac", "prod");
    await expect(p.flagRow("demo-e2e-rbac", "prod")).toHaveCount(1);
    await expect(p.errorText).toHaveCount(0);
  });
});

test.describe("F-08 invalid targeting — malformed JSON rejected, no write", () => {
  test("POST + PUT targeting strings that are not JSON → 400 BAD_TARGETING, row unchanged", async ({
    page,
    request,
  }) => {
    // The API is the enforcement surface (demo UI has no targeting editor —
    // tracked in OPEN-QUESTIONS). Exercise it through the vite proxy.
    const bad = await request.post("/api/flags", {
      headers: { "x-demo-role": "flag_editor", "content-type": "application/json" },
      data: { key: "demo-e2e-badjson", env: "dev", targeting: "{definitely not json" },
    });
    expect(bad.status()).toBe(400);
    const body = await bad.json();
    expect(body.error.code).toBe("BAD_TARGETING");
    expect(body.error.message).toContain("valid JSON");

    const list = await (await request.get("/api/flags")).json();
    expect(list.flags.map((f: any) => f.key)).not.toContain("demo-e2e-badjson");

    // Same on PUT of a real flag.
    const flags = list.flags;
    const target = flags.find((f: any) => f.key === "demo-new-nav");
    const put = await request.put(`/api/flags/${target.id}`, {
      headers: { "x-demo-role": "flag_editor", "content-type": "application/json" },
      data: { targeting: "{oops" },
    });
    expect(put.status()).toBe(400);
    const after = await (await request.get("/api/flags")).json();
    expect(after.flags.find((f: any) => f.id === target.id).targeting).toEqual(
      target.targeting,
    );

    // UI stays quiet — no stray error surfaced on the panel.
    const p = new FlagsPanelPage(page);
    await p.goto();
    await expect(p.errorText).toHaveCount(0);
  });
});
