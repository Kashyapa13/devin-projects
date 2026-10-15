import { test, expect } from "@playwright/test";
test("gate proof: deliberately broken FT", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByText("THIS TEXT DOES NOT EXIST — gate proof")).toBeVisible();
});
