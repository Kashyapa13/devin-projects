import { expect, test } from "@playwright/test";
import { CasePO, foreignCase, QueuePO } from "./pages";

/**
 * C4 masked-by-default + audited reveal (Feature Catalog "masked PII +
 * audited reveal"; PR-promise @p-pii-audited → "PII reveals audited 100%").
 *
 * NEVER recorded (PII law): this file runs with video off. The fixture
 * legal_name is synthetic (kyc-seed-v1 "SYNTH-ENTITY-NNNN") — asserting it
 * proves the mask/reveal path without exposing real PII.
 */
test.use({ video: "off" });

test.describe("masked PII + audited reveal", { tag: "@p-pii-audited" }, () => {
  test("masked by default; reveal returns synthetic name and writes the audit row", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    const id = await q.selectStatus("PENDING");
    await page.goto(`/#/case/${id}`);
    const c = new CasePO(page);

    // Default state is masked — the reveal action is a button, audited.
    await expect(c.masked()).toHaveText("••••••••");
    await expect(c.revealBtn()).toBeVisible();

    await page.keyboard.press("c"); // claim — reveal is assignee-scoped
    await expect(c.status()).toHaveText("IN_REVIEW", { timeout: 10_000 });

    await c.revealBtn().click();
    await expect(c.revealed()).toHaveText(/SYNTH-ENTITY-\d{4}/, { timeout: 10_000 });
    await expect(page.getByText(/Revealed — this read was audited/)).toBeVisible();
    // write-ahead: the audit row exists before/without needing the value
    await expect(c.timeline()).toContainText("case.reveal", { timeout: 10_000 });
  });

  test("non-assignee reveal is denied and mints no audit row", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    // an IN_REVIEW/ESCALATED case that belongs to someone else (or no one)
    // — API lookup, never queue-position luck.
    const id = await foreignCase("reviewer", ["IN_REVIEW", "ESCALATED"]);
    await page.goto(`/#/case/${id}`);
    const c = new CasePO(page);
    await expect(c.masked()).toHaveText("••••••••");
    await c.revealBtn().click();
    await expect(c.alert()).toBeVisible({ timeout: 10_000 });
    await expect(c.masked()).toHaveText("••••••••"); // stays masked
    const items = await c.timeline().locator("li").allTextContents();
    expect(items.filter((x) => x.includes("case.reveal")).length).toBe(0);
  });
});
