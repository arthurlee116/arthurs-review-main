import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/studio/login");
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/studio\/articles/);
}

async function openNewArticleEditor(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "New article" }).click();
  await expect(page).toHaveURL(/\/studio\/articles\/new/);
  const editor = page.getByRole("heading", { name: "New article" }).locator("..");
  await expect(editor).toBeVisible();
  return editor;
}

test("life page loads and the public nav links to it", async ({ page }) => {
  const response = await page.goto("/life");
  expect(response?.ok()).toBe(true);
  const publicNav = page.getByRole("navigation").first();
  await expect(publicNav.getByRole("link", { name: "生活", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "生活", exact: true })).toBeVisible();
});

test("admin publishes a life article and the photo wall links through to it", async ({ page }, testInfo) => {
  const slug = `life-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  const title = `生活测试文章 ${testInfo.project.name}`;
  await login(page);

  const editor = await openNewArticleEditor(page);
  await editor.getByLabel("Chinese title").fill(title);
  await editor.getByLabel("Slug").fill(slug);
  await editor.getByLabel("Category").selectOption("life");
  await editor.getByLabel("Chinese excerpt").fill("这是一篇生活测试摘要");
  await editor.getByLabel("SEO description").fill("生活测试 SEO 描述");
  await editor.getByRole("textbox", { name: "Chinese body" }).fill("生活正文内容");
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor.getByText("Draft saved")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor.getByText("Published")).toBeVisible();

  // The photo wall revalidates asynchronously via the cache.invalidate worker job.
  const wallLink = page.getByRole("link", { name: new RegExp(title) });
  await expect(async () => {
    await page.goto("/life");
    await expect(wallLink).toBeVisible();
  }).toPass();
  await wallLink.click();

  await expect(page).toHaveURL(new RegExp(`/life/${slug}$`));
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("生活正文内容")).toBeVisible();
});
