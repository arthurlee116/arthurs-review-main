import { expect, test } from "@playwright/test";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: import("@playwright/test").Page) {
  await page.goto("/studio/login");
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/studio\/articles/);
}

test("quick-post publishes a life article from the studio", async ({ page }) => {
  const caption = `quick-post 测试 ${Date.now()}`;
  await login(page);

  await page.getByRole("link", { name: "发生活" }).click();
  await expect(page).toHaveURL(/\/studio\/life\/new/);

  await page.getByLabel("Choose photos or videos").setInputFiles({
    name: "quick-post.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await page.getByLabel("Caption").fill(caption);
  const publishButton = page.getByRole("button", { name: "发布", exact: true });
  await expect(publishButton).toBeEnabled();
  await publishButton.click();

  await expect(page).toHaveURL(/\/life$/);

  // The photo wall revalidates asynchronously via the cache.invalidate worker job.
  const wallItem = page.locator("main a").first();
  await expect(async () => {
    await page.goto("/life");
    await expect(wallItem).toBeVisible();
  }).toPass();
  await wallItem.click();

  await expect(page).toHaveURL(/\/life\/life-\d{4}-\d{2}-\d{2}-[a-z0-9]{4}$/);
  await expect(page.getByText(caption)).toBeVisible();
  await expect(page.locator("article img").first()).toBeVisible();
});
