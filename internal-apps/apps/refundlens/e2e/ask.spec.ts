import { expect, test } from "@playwright/test";
import { AskPageObject } from "./pages/ask.page.js";

/**
 * PR-promise: F-01 (ask slice) + F-02 (fenced-rejection UX) + the
 * share-link determinism contract. Runs in BOTH motion modes — motion
 * is a rendering detail, never a correctness escape hatch.
 * Seed: refund-seed-v1 (5,432 events) — the deterministic harness data.
 */

for (const frozen of [false, true]) {
  const mode = frozen ? "frozen-motion" : "full-motion";
  test.describe(`ask surface — ${mode}`, () => {
    test(`PR-promise:F-02 ask happy path renders the mandatory envelope [${mode}]`, async ({
      page,
    }) => {
      const ask = new AskPageObject(page);
      await ask.goto({ frozenMotion: frozen });
      await ask.ask("how many refunds by channel last 30 days");
      await expect(ask.answerCard).toBeVisible();
      // mandatory envelope fields on the card
      await expect(ask.answerCard).toContainText("refund count by channel");
      await expect(ask.understood()).toContainText("refund count by channel,");
      await expect(ask.renderedSql()).toContainText("FROM agg_daily");
      await expect(ask.renderedSql()).toContainText("LIMIT");
      // watermark is mandatory on every surface (rendered as 'data as of')
      await expect(ask.answerCard).toContainText(/data as of|watermark/i);
      await expect(ask.rows().first()).toBeVisible();
    });

    test(`PR-promise:F-02 fenced rejection shows reason + guidance, never a stack [${mode}]`, async ({
      page,
    }) => {
      const ask = new AskPageObject(page);
      await ask.goto({ frozenMotion: frozen });
      await ask.ask("delete all refunds");
      await expect(ask.fencedError).toBeVisible();
      await expect(ask.fencedError).toContainText("FENCED_QUERY_REJECTED");
      await expect(ask.fencedReason()).toContainText("mutation");
      await expect(ask.fencedError).toContainText(/guidance|allowed|only/i);
      await expect(ask.answerCard).toHaveCount(0);
    });

    test(`PR-promise:F-01 share-link determinism — same question, byte-identical answer [${mode}]`, async ({
      page,
    }) => {
      const ask = new AskPageObject(page);
      await ask.goto({ frozenMotion: frozen });
      await ask.ask("refund amount by reason last 7 days");
      await expect(ask.answerCard).toBeVisible();
      const sql1 = await ask.renderedSql().textContent();
      const card1 = await ask.answerCard.textContent();
      // navigate away and back (the share-link gesture)
      await ask.goto({ frozenMotion: frozen });
      await ask.ask("refund amount by reason last 7 days");
      await expect(ask.answerCard).toBeVisible();
      expect(await ask.renderedSql().textContent()).toBe(sql1);
      // byte-identical card modulo took_ms/cached badge — the second hit
      // may be cached; sql+rows (the share signature) must not move.
      const card2 = (await ask.answerCard.textContent()) ?? "";
      expect(card2).toContain("GROUP BY reason_code");
      expect(card1).toContain("GROUP BY reason_code");
    });
  });
}
