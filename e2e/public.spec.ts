import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const expectedSiteURL = (process.env.E2E_EXPECTED_SITE_URL ?? baseURL).replace(/\/$/, "");

test("home page keeps the classic masthead and exposes every public archive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Arthur's Review" })).toBeVisible();
  const publicNav = page.getByRole("navigation").first();
  for (const label of ["Home", "时事评论", "社会分析", "杂七杂八", "Archive", "Proofs", "About"]) {
    await expect(publicNav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
});

test("mobile masthead stays stable and keeps the contact notice compact", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 956 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: 'html { font-size: 22px; } header h1 { font-family: Georgia, serif; }' });

  const layout = await page.evaluate(() => {
    const lineCount = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top * 10) / 10)).size;
    };
    const title = document.querySelector("header h1")!;
    const titleText = document.createRange();
    titleText.selectNodeContents(title);
    const titleRect = titleText.getBoundingClientRect();
    const notice = document.querySelector(".contact-notice")!;
    const noticeText = document.createRange();
    noticeText.selectNodeContents(notice);
    const noticeRect = noticeText.getBoundingClientRect();
    const accentRect = document.querySelector("header.container > div:last-child")!.getBoundingClientRect();
    const navRect = document.querySelector("nav")!.getBoundingClientRect();

    return {
      textSizeAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
      titleLines: lineCount(title),
      titleFits: titleRect.left >= 0 && titleRect.right <= innerWidth,
      noticeLines: lineCount(notice),
      topGap: noticeRect.top - accentRect.bottom,
      bottomGap: navRect.top - noticeRect.bottom,
    };
  });

  expect(layout.textSizeAdjust).toBe("100%");
  expect(layout.titleLines).toBe(1);
  expect(layout.titleFits).toBe(true);
  expect(layout.noticeLines).toBe(3);
  expect(Math.abs(layout.topGap - layout.bottomGap)).toBeLessThanOrEqual(2);
});

test("mobile article titles use the nine-character wrapping threshold", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 956 });

  const titleLayout = async (path: string) => {
    await page.goto(path);
    await page.addStyleTag({ content: "html { font-size: 22px; }" });
    const title = page.locator("main article h1");
    await expect(title).toBeVisible();
    return title.evaluate((title) => {
      const range = document.createRange();
      range.selectNodeContents(title);
      const rects = [...range.getClientRects()];
      return {
        lines: new Set(rects.map((rect) => Math.round(rect.top * 10) / 10)).size,
        textWrap: getComputedStyle(title).textWrap,
      };
    });
  };

  await expect(titleLayout("/misc/night-lines")).resolves.toMatchObject({ lines: 1 });
  await expect(titleLayout("/society/city-bystander")).resolves.toMatchObject({ lines: 2, textWrap: "balance" });
});

test("listing caps move the thirteenth article into Archive", async ({ page }) => {
  const archivedTitle = "E2E 上限文章 13";

  await page.goto("/");
  await expect(page.getByRole("main").locator("article")).toHaveCount(12);
  await expect(page.getByRole("main").getByRole("link", { name: archivedTitle })).toHaveCount(0);

  await page.goto("/commentary");
  await expect(page.getByRole("main").locator("article")).toHaveCount(8);
  await expect(page.getByRole("main").getByRole("link", { name: archivedTitle })).toHaveCount(0);

  await page.goto("/archive");
  await expect(page.getByRole("main").getByRole("link", { name: archivedTitle })).toBeVisible();
});

test("article without English body hides language switch", async ({ page }) => {
  await page.goto("/commentary/short-note");
  await expect(page.getByText("中文 / English")).toHaveCount(0);
});

test("article feedback stays out of the way and copies the WeChat id", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseURL).origin });
  await page.goto("/commentary/short-note");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "读完了？来挑错。" })).toBeVisible();
  await page.getByRole("button", { name: "复制微信号", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("微信号已复制");
});

test("RSS discovery, Proofs, and the dynamic social card are reachable", async ({ page, request }) => {
  await page.goto("/");
  const feedLinks = await page.locator('link[rel="alternate"][type="application/rss+xml"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(feedLinks.length).toBeGreaterThan(0);
  expect(new Set(feedLinks)).toEqual(new Set([`${expectedSiteURL}/feed.xml`]));

  await page.goto("/proofs");
  await expect(page.getByRole("heading", { level: 1, name: "Proofs" })).toBeVisible();

  const feed = await request.get("/feed.xml");
  expect(feed.ok()).toBe(true);
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");

  const socialCard = await request.get("/og?title=Playwright%20social%20card&kicker=Verification");
  expect(socialCard.ok()).toBe(true);
  expect(socialCard.headers()["content-type"]).toContain("image/png");
  expect((await socialCard.body()).byteLength).toBeGreaterThan(1_000);
});

test("production runtime exposes health, immutable version metadata, and production URLs", async ({ page, request }) => {
  const health = await request.get("/healthz");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true, checks: { database: "ok", storage: "ok", release: "ok" } });
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  const version = await request.get("/version");
  expect(version.ok()).toBe(true);
  expect(await version.json()).toEqual({
    commit: process.env.E2E_EXPECTED_COMMIT ?? "development",
    digest: process.env.E2E_EXPECTED_DIGEST ?? "development",
    schemaVersion: 9,
  });

  await page.goto("/");
  const socialURLs = await page.locator('meta[property="og:url"]').evaluateAll((tags) =>
    tags.map((tag) => tag.getAttribute("content")),
  );
  expect(socialURLs.length).toBeGreaterThan(0);
  expect(new Set(socialURLs)).toEqual(new Set([expectedSiteURL]));
});

test("search returns matching published article", async ({ page }) => {
  await page.goto("/search?q=城市");
  await expect(page.getByRole("link", { name: /城市/ })).toBeVisible();
});

test("semantic search finds a published article without an FTS match", async ({ page }) => {
  test.skip(process.env.E2E_EXPECT_SEMANTIC !== "1", "requires the locked real model and completed embeddings");

  await page.goto(`/search?q=${encodeURIComponent("群居生活如何把袖手旁观塑造成得体行为")}`);
  await expect(page.getByRole("link", { name: "一座城市如何把人训练成旁观者" })).toBeVisible();
});
