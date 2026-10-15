import { expect, type Page } from "@playwright/test";
import { mintToken } from "../scripts/mint-token.js";

/**
 * Page objects for the FastLane FT suites. Every flow runs twice via the
 * project matrix — motion on, and `motion-frozen` (the Interaction-law
 * test flag: localStorage "motion-frozen"="1", planted per-project in
 * global-setup). Selectors stick to roles/labels/contract classes, never
 * visual position.
 */

export const SUBS = {
  reviewer: "11111111-1111-1111-1111-111111111111",
  supervisor: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
} as const;
export type Role = keyof typeof SUBS;

/** Swap the session JWT for another seeded role mid-test (addInitScript
 *  wins over the planted storageState on the next navigation). */
export async function asRole(page: Page, role: Role): Promise<void> {
  const token = mintToken({
    secret: process.env.SESSION_SECRET!,
    sub: SUBS[role],
    roles: [role],
  });
  await page.addInitScript((t) => {
    localStorage.setItem("fastlane_token", t);
  }, token);
}

/** A garbage token must surface the error state, never "Loading…" forever. */
export async function asBadToken(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("fastlane_token", "garbage.not-a-jwt");
  });
}

/** Node-side API read for test setup — deterministic regardless of where
 *  a case lands in the paginated queue. */
async function apiGet(path: string, role: Role): Promise<unknown> {
  const token = mintToken({
    secret: process.env.SESSION_SECRET!,
    sub: SUBS[role],
    roles: [role],
  });
  const res = await fetch(
    `http://127.0.0.1:${process.env.FT_WEB_PORT ?? 5173}${path}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  return res.json();
}

/** First case whose assignee is NOT `role`'s sub — for not-assignee corpus. */
export async function foreignCase(role: Role, statuses: string[]): Promise<string> {
  const me = SUBS[role];
  const q = (await apiGet("/api/v1/queue?tab=team&limit=200", role)) as {
    rows: { id: string; status: string }[];
  };
  for (const row of q.rows) {
    if (!statuses.includes(row.status)) continue;
    const k = (await apiGet(`/api/v1/cases/${row.id}`, role)) as { assignee_id: string | null };
    if (k.assignee_id !== me) return row.id;
  }
  throw new Error(`no ${statuses.join("/")} case foreign to ${role} in seed`);
}

export class QueuePO {
  constructor(public page: Page) {}
  goto() {
    return this.page.goto("/");
  }
  caption() {
    return this.page.locator("caption", { hasText: "KYC review queue" });
  }
  rows() {
    return this.page.locator("tbody tr[data-row-id]");
  }
  statuses() {
    return this.page.locator("tbody tr .pill").allTextContents();
  }
  selected() {
    return this.page.locator('tr[aria-current="true"]');
  }
  tab(name: "mine" | "team" | "breaching") {
    return this.page.locator("nav.seg button", { hasText: name });
  }
  riskSelect() {
    return this.page.locator("select[aria-label]");
  }
  loadMore() {
    return this.page.locator("button", { hasText: /load|more/i });
  }
  alert() {
    return this.page.locator('p[role="alert"]');
  }
  /** index of the first row whose status pill equals `status`, -1 if none. */
  async firstIndexOf(status: string): Promise<number> {
    return (await this.statuses()).findIndex((s) => s.trim() === status);
  }
  /** j/k to the first row with the given status; returns its case id. */
  async selectStatus(status: string): Promise<string> {
    const idx = await this.firstIndexOf(status);
    expect(idx, `seed must leave a ${status} row`).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < idx; i++) await this.page.keyboard.press("j");
    const sel = this.selected();
    await expect(sel.locator(".pill")).toHaveText(status);
    const id = await sel.getAttribute("data-row-id");
    expect(id).toBeTruthy();
    return id!;
  }
}

export class CasePO {
  constructor(public page: Page) {}
  heading() {
    return this.page.locator("h1");
  }
  status() {
    return this.page.locator(".case-fields .pill");
  }
  masked() {
    return this.page.locator(".masked");
  }
  revealBtn() {
    return this.page.locator("button", { hasText: "Reveal name (audited)" });
  }
  revealed() {
    return this.page.locator(".panel strong");
  }
  reasonBox() {
    return this.page.locator('textarea[aria-label="Reject — reason required"]');
  }
  noteBox() {
    return this.page.locator('textarea[aria-label="Add note"]');
  }
  submitReject() {
    return this.page.locator("button", { hasText: "Reject case" });
  }
  submitNote() {
    return this.page.locator("button", { hasText: "Save note" });
  }
  alert() {
    return this.page.locator('p[role="alert"]');
  }
  timeline() {
    return this.page.locator(".timeline");
  }
  docLink() {
    return this.page.locator("a", { hasText: "Open doc" });
  }
  back() {
    return this.page.locator("button", { hasText: /back to queue/i });
  }
}
