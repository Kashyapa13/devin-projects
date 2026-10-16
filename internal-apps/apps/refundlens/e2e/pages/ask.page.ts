import { expect, type Locator, type Page } from "@playwright/test";

/** AskPage page object — the only implemented surface in the skeleton. */
export class AskPageObject {
  readonly input: Locator;
  readonly submit: Locator;
  readonly answerCard: Locator;
  readonly fencedError: Locator;

  constructor(readonly page: Page) {
    this.input = page.locator("form input").first();
    this.submit = page.locator('form button[type="submit"]');
    this.answerCard = page.getByTestId("answer-card");
    this.fencedError = page.getByTestId("fenced-error");
  }

  async goto(opts?: { frozenMotion?: boolean }) {
    await this.page.goto(opts?.frozenMotion ? "/?motion=frozen" : "/");
    await expect(this.input).toBeVisible();
  }

  async ask(question: string) {
    await this.input.fill(question);
    await this.submit.click();
  }

  /** rendered SQL inside the answer card's <details> */
  renderedSql() {
    return this.answerCard.locator("details.sql pre");
  }

  understood() {
    return this.answerCard.locator("p.examples");
  }

  badge() {
    return this.answerCard.locator(".badge");
  }

  rows() {
    return this.answerCard.locator("table.rows tbody tr");
  }

  fencedReason() {
    return this.fencedError.locator("code");
  }
}
