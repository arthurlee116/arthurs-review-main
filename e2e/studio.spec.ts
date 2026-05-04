import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/studio/login");
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/studio\/articles/);
}

test("studio requires login", async ({ page }) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/studio\/login/);
});

test("admin can create draft, preview, publish, and see public article", async ({ page }, testInfo) => {
  const slug = `test-article-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  await login(page);

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

test("admin can filter the article list by status category and search", async ({ page }) => {
  await login(page);
  await page.goto("/studio/articles");

  await page.getByLabel("Status").selectOption("draft");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /一篇还不该出现的草稿/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /一座城市如何把人训练成旁观者/ })).toHaveCount(0);

  await page.getByLabel("Status").selectOption("all");
  await page.getByLabel("Category").selectOption("society");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /一座城市如何把人训练成旁观者/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /夜里写下的几行诗/ })).toHaveCount(0);

  await page.getByLabel("Search").fill("余温");
  await page.getByLabel("Category").selectOption("all");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /短评的锋利应该留一点余温/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /一座城市如何把人训练成旁观者/ })).toHaveCount(0);
});

test("publishing an existing article saves current editor input first", async ({ page }, testInfo) => {
  const slug = `publish-current-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  await login(page);

  await page.getByRole("link", { name: "New article" }).click();
  await page.getByLabel("Chinese title").fill("发布前保存当前内容");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Category").selectOption("commentary");
  await page.getByLabel("Chinese excerpt").fill("测试发布前保存");
  await page.getByLabel("SEO description").fill("测试发布前保存");
  await page.getByLabel("Chinese body").fill("旧正文");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();

  await page.getByLabel("Chinese body").fill("新正文");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published")).toBeVisible();

  await page.goto(`/commentary/${slug}`);
  await expect(page.getByText("新正文")).toBeVisible();
  await expect(page.getByText("旧正文")).toHaveCount(0);
});

test("admin can unpublish an article back to draft", async ({ page }, testInfo) => {
  const slug = `unpublish-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  await login(page);

  await page.getByRole("link", { name: "New article" }).click();
  await page.getByLabel("Chinese title").fill("可以撤回的文章");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Category").selectOption("commentary");
  await page.getByLabel("Chinese excerpt").fill("测试撤回");
  await page.getByLabel("SEO description").fill("测试撤回");
  await page.getByLabel("Chinese body").fill("正文");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published")).toBeVisible();

  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Unpublished")).toBeVisible();

  await page.goto(`/commentary/${slug}`);
  await expect(page.getByRole("heading", { name: "可以撤回的文章" })).toHaveCount(0);
});
