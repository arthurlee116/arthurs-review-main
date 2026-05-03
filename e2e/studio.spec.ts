import { expect, test } from "@playwright/test";

test("studio requires login", async ({ page }) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/studio\/login/);
});

test("admin can create draft, preview, publish, and see public article", async ({ page }, testInfo) => {
  const slug = `test-article-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  await page.goto("/studio/login");
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await page.getByRole("link", { name: "New article" }).click();
  await page.getByLabel("Chinese title").fill("测试文章");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Category").selectOption("commentary");
  await page.getByLabel("Chinese excerpt").fill("这是一篇测试摘要");
  await page.getByLabel("SEO description").fill("测试 SEO 描述");
  await page.getByLabel("Chinese body").fill("这是正文。");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published")).toBeVisible();
  await page.goto(`/commentary/${slug}`);
  await expect(page.getByRole("heading", { name: "测试文章" })).toBeVisible();
});
