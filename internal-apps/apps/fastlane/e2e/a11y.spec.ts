import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

/** Gate §7.6 — axe-core: zero critical violations on both surfaces. */
test.describe("axe — zero critical", () => {
  test("queue page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("table.queue-table")).toBeVisible();
    const res = await new AxeBuilder({ page }).analyze();
    const critical = res.violations.filter(
      (v) => v.impact === "critical",
    );
    expect(critical).toEqual([]);
  });

  test("case page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("table.queue-table")).toBeVisible();
    const first = page.locator("tbody tr[data-row-id]").first();
    const id = await first.getAttribute("data-row-id");
    await page.goto(`/#/case/${id}`);
    await expect(page.locator(".case-fields")).toBeVisible();
    const res = await new AxeBuilder({ page }).analyze();
    const critical = res.violations.filter(
      (v) => v.impact === "critical",
    );
    expect(critical).toEqual([]);
  });
});
