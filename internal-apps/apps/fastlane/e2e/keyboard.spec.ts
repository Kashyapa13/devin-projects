import { expect, test, type Page } from "@playwright/test";

/**
 * The anchor's e2e gate (AGENTS.md §7.5), keyboard-only:
 *   claim → reject-without-reason (actionable 400) → reject-ok →
 *   audit visible → case leaves the queue.
 * PII law: the masked C4 panel is asserted masked — reveal is NEVER
 * exercised in the suite (recordings/tests must not unmask; §3).
 */

const PENDING_INDEX = async (page: Page): Promise<number> => {
  const statuses = await page
    .locator("tbody tr .pill")
    .allTextContents();
  return statuses.findIndex((s) => s.trim() === "PENDING");
};

test.describe("keyboard-day queue → decision panel", () => {
  test("claim → reject-400 → reject-ok → audit → removal", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator("caption", { hasText: "KYC review queue" }),
    ).toBeVisible();

    // j/k to the first PENDING row (claim only works on PENDING).
    const idx = await PENDING_INDEX(page);
    expect(idx, "seed must leave a PENDING row on the team tab").toBeGreaterThanOrEqual(0);
    for (let i = 0; i < idx; i++) await page.keyboard.press("j");
    const selected = page.locator('tr[aria-current="true"]');
    await expect(selected.locator(".pill")).toHaveText("PENDING");
    const caseId = await selected.getAttribute("data-row-id");
    expect(caseId).toBeTruthy();

    // Enter opens the decision panel.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/case\/[0-9a-f-]+/);
    await expect(page.locator("h1")).toContainText("FastLane — CUST-");

    // c claims → IN_REVIEW.
    await page.keyboard.press("c");
    await expect(page.locator(".case-fields .pill")).toHaveText("IN_REVIEW", {
      timeout: 10_000,
    });

    // r opens the reason box; submitting empty must 400 with an actionable message.
    await page.keyboard.press("r");
    const reasonBox = page.locator('textarea[aria-label="Reject — reason required"]');
    await expect(reasonBox).toBeVisible();
    await expect(reasonBox).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText("reason");

    // Shift+Tab back, type a real reason, Tab → Enter submits.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.type("Gate e2e: rejection needs a documented reason");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator(".case-fields .pill")).toHaveText("REJECTED", {
      timeout: 10_000,
    });

    // Audit timeline shows both decisions (4s refetch).
    const timeline = page.locator(".timeline");
    await expect(timeline).toContainText("case.in_review", { timeout: 10_000 });
    await expect(timeline).toContainText("case.rejected", { timeout: 10_000 });

    // The masked C4 panel stays masked — no reveal exercised here.
    await expect(page.locator(".masked")).toHaveText("••••••••");

    // Esc back to the queue; the rejected case is gone after refetch.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.locator(`tr[data-row-id="${caseId}"]`),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
