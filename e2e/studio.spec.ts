import { expect, test } from "@playwright/test";

const complexMarkdown = `## Markdown 样例

[清晰链接](https://example.com)

> 一段值得保留的引用。

- 第一项
- 第二项

| 项目 | 结果 |
| --- | --- |
| 表格 | 正常 |

行内代码是 \`const answer = 42\`。

\`\`\`ts
const answer = 42;
\`\`\``;

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

test("studio requires login", async ({ page }) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/studio\/login/);
});

test("admin can create draft, preview, publish, and see public article", async ({ page }, testInfo) => {
  const slug = `test-article-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  await login(page);

  const editor = await openNewArticleEditor(page);
  await editor.getByLabel("Chinese title").fill("测试文章");
  await editor.getByLabel("Slug").fill(slug);
  await editor.getByLabel("Category").selectOption("commentary");
  await editor.getByLabel("Chinese excerpt").fill("这是一篇测试摘要");
  await editor.getByLabel("SEO description").fill("测试 SEO 描述");
  await editor.getByRole("textbox", { name: "Chinese body" }).fill(complexMarkdown);
  const saveDraft = editor.getByRole("button", { name: "Save draft" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await saveDraft.click();
  await expect(editor.getByText("Draft saved")).toBeVisible();

  const previewPromise = page.waitForEvent("popup");
  await editor.getByRole("link", { name: "Preview" }).click();
  const preview = await previewPromise;
  await expect(preview.getByRole("heading", { level: 2, name: "Markdown 样例" })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "正常" })).toBeVisible();
  await preview.close();

  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor.getByText("Published")).toBeVisible();
  await page.goto(`/commentary/${slug}`);
  await expect(page.getByRole("heading", { name: "测试文章" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Markdown 样例" })).toBeVisible();
  await expect(page.getByRole("link", { name: "清晰链接" })).toHaveAttribute("href", "https://example.com");
  await expect(page.getByText("一段值得保留的引用。")).toBeVisible();
  await expect(page.getByRole("cell", { name: "正常" })).toBeVisible();
  await expect(page.getByText("const answer = 42;", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "读完了？来挑错。" })).toBeVisible();
  await expect(page.getByRole("link", { name: "邮件反馈" })).toHaveCSS("color", "rgb(247, 241, 230)");
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

  const editor = await openNewArticleEditor(page);
  await editor.getByLabel("Chinese title").fill("发布前保存当前内容");
  await editor.getByLabel("Slug").fill(slug);
  await editor.getByLabel("Category").selectOption("commentary");
  await editor.getByLabel("Chinese excerpt").fill("测试发布前保存");
  await editor.getByLabel("SEO description").fill("测试发布前保存");
  await editor.getByRole("textbox", { name: "Chinese body" }).fill("旧正文");
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor.getByText("Draft saved")).toBeVisible();

  await editor.getByRole("textbox", { name: "Chinese body" }).fill("新正文");
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor.getByText("Published")).toBeVisible();

  await page.goto(`/commentary/${slug}`);
  await expect(page.getByText("新正文")).toBeVisible();
  await expect(page.getByText("旧正文")).toHaveCount(0);
});

test("admin can unpublish an article back to draft", async ({ page }, testInfo) => {
  const slug = `unpublish-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  await login(page);

  const editor = await openNewArticleEditor(page);
  await editor.getByLabel("Chinese title").fill("可以撤回的文章");
  await editor.getByLabel("Slug").fill(slug);
  await editor.getByLabel("Category").selectOption("commentary");
  await editor.getByLabel("Chinese excerpt").fill("测试撤回");
  await editor.getByLabel("SEO description").fill("测试撤回");
  await editor.getByRole("textbox", { name: "Chinese body" }).fill("正文");
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor.getByText("Draft saved")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor.getByText("Published")).toBeVisible();

  await editor.getByRole("button", { name: "Unpublish" }).click();
  await expect(editor.getByText("Unpublished")).toBeVisible();

  await page.goto(`/commentary/${slug}`);
  await expect(page.getByRole("heading", { name: "可以撤回的文章" })).toHaveCount(0);
});
