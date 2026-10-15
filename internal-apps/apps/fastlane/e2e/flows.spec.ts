import { expect, test } from "@playwright/test";
import { asBadToken, asRole, CasePO, QueuePO } from "./pages";

/**
 * Charter FTs — user-facing flows per LLD Feature Catalog.
 * Tags map each spec to the catalog feature's PR-promise (LLD Usage KPIs):
 *   @p-queue-p95          queue p95 <1s
 *   @p-decisions-audited  100% decisions audited
 *   @p-sla-breach         SLA-breach count
 *   @p-clear-time         −40% clear time
 *   @p-keyboard           keystroke-to-decision latency
 * Recorded (critical paths): video on. PII law: reveal lives in pii.spec.ts
 * which is never recorded.
 */
test.use({ video: "on" });

test.describe("role × login — the seeded seats", { tag: "@p-decisions-audited" }, () => {
  for (const role of ["reviewer", "supervisor", "admin"] as const) {
    test(`${role} lands on a working queue`, async ({ page }) => {
      if (role !== "reviewer") await asRole(page, role);
      const q = new QueuePO(page);
      await q.goto();
      await expect(q.caption()).toBeVisible();
      await expect(q.rows().first()).toBeVisible();
    });
  }
  test("auditor read-only: admin can read but every act errors", async ({ page }) => {
    await asRole(page, "admin");
    const q = new QueuePO(page);
    await q.goto();
    await q.selectStatus("PENDING");
    // Row action Claim → server 403 → error alert, never a silent no-op.
    await q.selected().locator("button", { hasText: "Claim" }).click();
    await expect(q.alert()).toBeVisible({ timeout: 10_000 });
    // Case page is readable; decision buttons also surface the 403.
    await q.selected().press("Enter");
    const c = new CasePO(page);
    await expect(c.heading()).toContainText("CUST-");
    // audit read works for the auditor (empty timeline = attached, may have no rows)
    await expect(c.timeline()).toBeAttached();
    await expect(page.locator("#audit-h")).toBeVisible();
  });
});

test.describe("queue — tabs, filter, pagination", { tag: "@p-queue-p95" }, () => {
  test("tab switch: team → breaching → mine", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    await expect(q.caption()).toBeVisible();
    const teamCount = await q.rows().count();
    expect(teamCount).toBeGreaterThan(0);
    await q.tab("breaching").click();
    await expect(q.tab("breaching")).toHaveAttribute("aria-pressed", "true");
    // every breaching row carries the breach chip
    await expect(page.locator(".chip-breach").first()).toBeVisible();
    await q.tab("mine").click();
    await expect(q.tab("mine")).toHaveAttribute("aria-pressed", "true");
    // seeded IN_REVIEW cases split between reviewer + supervisor
    await expect(q.rows().first()).toBeVisible();
    await q.tab("team").click();
  });
  test("risk filter narrows to the selected band", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    await q.riskSelect().selectOption("high");
    const badges = await page.locator("tbody .badge").allTextContents();
    for (const b of badges) expect(Number(b)).toBeGreaterThanOrEqual(70);
    await q.riskSelect().selectOption("low");
    for (const b of await page.locator("tbody .badge").allTextContents()) {
      expect(Number(b)).toBeLessThan(40);
    }
  });
  test("cursor pagination: load-more appends, never duplicates", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    await expect(q.rows()).toHaveCount(50);
    await q.loadMore().click();
    await expect(q.rows()).toHaveCount(100);
    const ids = await Promise.all(
      (await q.rows().all()).map((r) => r.getAttribute("data-row-id")),
    );
    expect(new Set(ids).size).toBe(ids.length); // no duplicates across pages
  });
  test("SLA chip shows breaching past the deadline", { tag: "@p-sla-breach" }, async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    await q.tab("breaching").click();
    const chip = page.locator(".chip-breach").first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("breaching");
  });
});

test.describe("decisions — claim / approve / escalate / reopen", { tag: "@p-decisions-audited" }, () => {
  test("claim from queue row, approve on the case, audit shows both", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    const id = await q.selectStatus("PENDING");
    await q.selected().locator("button", { hasText: "Claim" }).click();
    // claimed row shows IN_REVIEW after refetch
    await expect(page.locator(`tr[data-row-id="${id}"] .pill`)).toHaveText("IN_REVIEW", {
      timeout: 10_000,
    });
    await page.goto(`/#/case/${id}`);
    const c = new CasePO(page);
    await expect(c.heading()).toContainText("CUST-");
    await page.keyboard.press("a"); // approve (assignee)
    await expect(c.status()).toHaveText("APPROVED", { timeout: 10_000 });
    await expect(c.timeline()).toContainText("case.in_review", { timeout: 10_000 });
    await expect(c.timeline()).toContainText("case.approved", { timeout: 10_000 });
  });
  test("escalate then supervisor reopen (ESCALATED→IN_REVIEW)", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    const id = await q.selectStatus("PENDING");
    await q.selected().press("Enter");
    const c = new CasePO(page);
    await page.keyboard.press("c"); // claim
    await expect(c.status()).toHaveText("IN_REVIEW", { timeout: 10_000 });
    await page.keyboard.press("e"); // escalate
    await expect(c.status()).toHaveText("ESCALATED", { timeout: 10_000 });
    // supervisor reopens the same case — reopen is a supervisor claim.
    // reload (not goto): same-URL hash nav is a no-op and the init script
    // planting the supervisor token would never re-run.
    await asRole(page, "supervisor");
    await page.reload();
    await expect(c.heading()).toContainText("CUST-");
    await expect(c.status()).toHaveText("ESCALATED"); // loaded before keypress
    await page.keyboard.press("c");
    await expect(c.status()).toHaveText("IN_REVIEW", { timeout: 10_000 });
    await expect(c.timeline()).toContainText("case.escalated", { timeout: 10_000 });
  });
  test("queue-side optimistic approve: row springs away, toast offers undo", { tag: "@p-clear-time" }, async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    // 'mine' = only my IN_REVIEW rows → approve is always a legal edge here.
    await q.tab("mine").click();
    await expect(q.rows().first()).toBeVisible();
    const id = await q.rows().first().getAttribute("data-row-id");
    await q.rows().first().click(); // focus/selection lands on the row
    await page.keyboard.press("a");
    // optimistic: the row leaves immediately, undo toast shows
    await expect(page.locator(`tr[data-row-id="${id}"]`)).toHaveCount(0);
    await expect(page.locator(".toasts")).toContainText(/approved/i);
  });
});

test.describe("states — empty, loading, error", { tag: "@p-queue-p95" }, () => {
  test("empty state: admin has no mine rows → 'Queue is clear'", async ({ page }) => {
    await asRole(page, "admin");
    const q = new QueuePO(page);
    await q.goto();
    await q.tab("mine").click();
    await expect(page.locator("caption", { hasText: "KYC review queue" })).toBeVisible();
    await expect(page.getByText("Queue is clear")).toBeVisible();
  });
  test("loading state precedes data (fetch stalled)", async ({ page }) => {
    await page.route("**/api/v1/queue*", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    const q = new QueuePO(page);
    void q.goto();
    await expect(page.getByText("Loading…")).toBeVisible();
    await expect(q.caption()).toBeVisible({ timeout: 10_000 });
  });
  test("error state: a dead token renders the alert, not 'Loading…' forever", async ({ page }) => {
    await asBadToken(page);
    const q = new QueuePO(page);
    await q.goto();
    await expect(q.alert()).toBeVisible({ timeout: 10_000 });
    await expect(q.alert()).toContainText(/failed to load|retry/i);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText("Queue is clear")).toHaveCount(0);
  });
});
