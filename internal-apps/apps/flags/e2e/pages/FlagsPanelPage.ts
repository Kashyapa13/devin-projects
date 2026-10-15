import { expect, type Page, type Locator, type Response } from "@playwright/test";

const isApi = (r: Response, method: string, path = "/api/flags") =>
  r.url().includes(path) && r.request().method() === method;

/** Page object for the flags capability-demo panel (web/src/App.tsx surface). */
export class FlagsPanelPage {
  readonly page: Page;
  readonly banner: Locator;
  readonly roleSelect: Locator;
  readonly keyInput: Locator;
  readonly envSelect: Locator;
  readonly createButton: Locator;
  readonly errorText: Locator;
  readonly flagTable: Locator;
  readonly demoSection: Locator;
  readonly auditTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.banner = page.locator(".demo-label");
    this.roleSelect = page.locator("select").first();
    this.keyInput = page.locator('input[aria-label="new flag key (demo-*)"]');
    this.envSelect = page.locator(".flagform .seg button");
    this.createButton = page.getByRole("button", { name: "Create flag" });
    this.errorText = page.locator(".error-card");
    this.flagTable = page.locator("table").first();
    this.demoSection = page.locator(".flip-zone");
    this.auditTable = page.locator("table").nth(1);
  }

  async goto() {
    await this.page.goto("/");
  }

  /** The table row for one (key, env) flag — exact cell match so demo-x ≠ demo-x2. */
  flagRow(key: string, env: string): Locator {
    return this.flagTable
      .locator("tbody tr")
      .filter({ has: this.page.getByRole("cell", { name: key, exact: true }) })
      .filter({ has: this.page.getByRole("cell", { name: env, exact: true }) });
  }

  rowState(row: Locator): Locator {
    return row.locator("td").nth(2);
  }

  flipButton(row: Locator): Locator {
    return row.getByRole("button", { name: "flip" });
  }

  deleteInput(row: Locator): Locator {
    return row.locator('input[placeholder="type key to delete"]');
  }

  deleteButton(row: Locator): Locator {
    return row.getByRole("button", { name: "delete" });
  }

  /** Create via the form; resolves with the POST response (await it before next action). */
  async create(key: string, env: string): Promise<Response> {
    await this.keyInput.fill(key);
    await this.page.locator(".flagform .seg button", { hasText: env }).click();
    const [res] = await Promise.all([
      this.page.waitForResponse((r) => isApi(r, "POST")),
      this.createButton.click(),
    ]);
    return res;
  }

  /** Flip a flag row's targeting; resolves with the PUT response. */
  async flip(row: Locator): Promise<Response> {
    const [res] = await Promise.all([
      this.page.waitForResponse((r) => isApi(r, "PUT")),
      this.flipButton(row).click(),
    ]);
    return res;
  }

  /** Typed-confirm delete; resolves with the DELETE response. */
  async deleteFlag(row: Locator, confirmText: string): Promise<Response> {
    await this.deleteInput(row).fill(confirmText);
    const [res] = await Promise.all([
      this.page.waitForResponse((r) => isApi(r, "DELETE")),
      this.deleteButton(row).click(),
    ]);
    return res;
  }

  async setRole(role: "viewer" | "flag_editor" | "flag_admin") {
    await this.roleSelect.selectOption(role);
  }

  auditRow(action: string, key?: string): Locator {
    const rows = this.auditTable
      .locator("tbody tr")
      .filter({ hasText: action });
    return key ? rows.filter({ hasText: key }) : rows;
  }

  async expectErrorContaining(text: string) {
    await expect(this.errorText).toContainText(text);
  }
}
