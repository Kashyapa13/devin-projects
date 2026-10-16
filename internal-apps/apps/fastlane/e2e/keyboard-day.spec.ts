import { expect, test } from "@playwright/test";
import { asRole, CasePO, QueuePO } from "./pages";

/**
 * The full keyboard-only day (Interaction law — non-negotiable):
 * every action reachable and completable without the mouse, in BOTH
 * motion modes (project matrix). Recorded — this is the reference flow.
 * PR-promises: @p-keyboard (keystroke-to-decision latency), @p-decisions-audited.
 */
test.use({ video: "on" });

test.describe("keyboard-only day", { tag: "@p-keyboard" }, () => {
  test("j/k → Enter → c claim → n note → e escalate → Esc — zero pointer", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    await expect(q.caption()).toBeVisible();

    // j/k navigation moves aria-current deterministically.
    await page.keyboard.press("j");
    await expect(q.selected()).toHaveCount(1);
    await page.keyboard.press("k");
    const id = await q.selectStatus("PENDING");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#/case/${id}`));
    const c = new CasePO(page);
    await expect(c.heading()).toContainText("CUST-");

    await page.keyboard.press("c"); // claim
    await expect(c.status()).toHaveText("IN_REVIEW", { timeout: 10_000 });

    await page.keyboard.press("n"); // note box opens, auto-focused
    const note = c.noteBox();
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    // keys must NOT fire inside editable fields (Interaction law)
    await page.keyboard.type("jkcaernd");
    await expect(note).toHaveValue("jkcaernd");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("note: gate check by keyboard only");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter"); // Save note
    await expect(c.timeline()).toContainText("case.note", { timeout: 10_000 });

    await page.keyboard.press("e"); // escalate
    await expect(c.status()).toHaveText("ESCALATED", { timeout: 10_000 });

    await page.keyboard.press("Escape"); // back to queue
    await expect(page).toHaveURL(/#\/$/);
    await expect(q.caption()).toBeVisible();
  });

  test("keyboard approve a → APPROVED → audit row", { tag: "@p-decisions-audited" }, async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    const id = await q.selectStatus("PENDING");
    await page.keyboard.press("Enter");
    const c = new CasePO(page);
    await page.keyboard.press("c");
    await expect(c.status()).toHaveText("IN_REVIEW", { timeout: 10_000 });
    await page.keyboard.press("a");
    await expect(c.status()).toHaveText("APPROVED", { timeout: 10_000 });
    await expect(c.timeline()).toContainText("case.approved", { timeout: 10_000 });
  });

  test("reject deep-link: r opens the reason box from the queue", async ({ page }) => {
    const q = new QueuePO(page);
    await q.goto();
    const id = await q.selectStatus("IN_REVIEW");
    await page.keyboard.press("r");
    await expect(page).toHaveURL(new RegExp(`#/case/${id}\\?reject=1`));
    const c = new CasePO(page);
    await expect(c.reasonBox()).toBeVisible();
    await expect(c.reasonBox()).toBeFocused();
  });
});
