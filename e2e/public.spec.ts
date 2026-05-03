import { expect, test } from "@playwright/test";

test("home page has classic masthead and five navigation entries", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Arthur's Review" })).toBeVisible();
  for (const label of ["Home", "时事评论", "社会分析", "杂七杂八", "About"]) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
});

test("article without English body hides language switch", async ({ page }) => {
  await page.goto("/commentary/short-note");
  await expect(page.getByText("中文 / English")).toHaveCount(0);
});

test("search returns matching published article", async ({ page }) => {
  await page.goto("/search?q=城市");
  await expect(page.getByRole("link", { name: /城市/ })).toBeVisible();
});
