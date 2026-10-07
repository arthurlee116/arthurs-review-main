import { expect, test } from "./fixtures";

test("entry redirects respect language URLs, manual preference and legacy queries", async ({ page, request, context }) => {
  const entry = await request.get("/archive?page=2", { maxRedirects: 0 });
  expect(entry.status()).toBe(307);
  expect(entry.headers()["location"]).toContain("/en/archive?page=2");
  expect(entry.headers()["cache-control"]).toContain("no-store");
  const old = await request.get("/search?q=城市&page=2&lang=en", { maxRedirects: 0 });
  expect(old.headers()["location"]).toContain("/en/search?q=");
  expect(old.headers()["location"]).toContain("page=2");
  expect(old.headers()["location"]).not.toContain("lang=");
  await page.goto("/en/archive?page=2#articles");
  await page.locator("footer").getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/archive\?page=2#articles$/);
  const cookie = (await context.cookies()).find((cookie) => cookie.name === "preferred_locale")!;
  expect(cookie.value).toBe("zh");
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(31_000_000);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.goto("/");
  await expect(page).toHaveURL(/\/zh$/);
  await page.goto("/en/about");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await page.locator("footer").getByRole("button", { name: "English", exact: true }).click();
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "preferred_locale")?.value).toBe("en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});

test("both language page sets keep navigation, dates, controls and RSS localized", async ({ page, request }) => {
  for (const locale of ["zh", "en"]) {
    for (const path of ["", "/recommended", "/commentary", "/society", "/misc", "/life", "/archive", "/proofs", "/about", "/search?q=城市"]) {
      await page.goto("/" + locale + path);
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh" ? "zh-CN" : "en-GB");
      const nav = page.getByRole("navigation").first();
      const labels = locale === "zh" ? ["首页", "推荐", "时事评论", "社会分析", "杂七杂八", "生活", "归档", "发表存证", "关于"] : ["Home", "Recommended", "Commentary", "Social Analysis", "Miscellany", "Life", "Archive", "Proofs", "About"];
      for (const label of labels) await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
      await expect(page.locator("footer").getByRole("link", { name: "RSS", exact: true })).toHaveAttribute("href", "/" + locale + "/feed.xml");
      const switcher = page.locator("footer [data-language-switch]");
      await expect(switcher.getByRole("button", { name: locale === "zh" ? "中文" : "English", exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    const feed = await request.get("/" + locale + "/feed.xml");
    expect(feed.ok()).toBe(true);
    const xml = await feed.text();
    expect(xml).toContain("<language>" + (locale === "zh" ? "zh-CN" : "en-GB") + "</language>");
    expect(xml).toContain("/" + locale + "/society/city-bystander");
  }
});

test("article translations and fallback keep content language separate from interface", async ({ page }) => {
  await page.goto("/en/society/city-bystander");
  await expect(page.locator("main article h1")).toHaveText("How a City Trains People Into Bystanders");
  await expect(page.locator("main article")).toHaveAttribute("lang", "en-GB");
  await page.goto("/en/commentary/short-note");
  await expect(page.locator("main article h1")).toHaveText("短评的锋利应该留一点余温");
  await expect(page.locator("main article")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("navigation").first().getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/zh\/commentary\/short-note$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(0);
  await page.goto("/en/search?q=bystanders");
  await expect(page.getByRole("link", { name: "How a City Trains People Into Bystanders", exact: true })).toBeVisible();
  await expect(page.locator("main article").first()).toContainText("city");
  await page.goto("/zh/this-page-does-not-exist");
  await expect(page.locator("main")).toContainText("这个页面不存在");
  await page.goto("/en/this-page-does-not-exist");
  await expect(page.locator("main")).toContainText("does not exist");
});

test("footer language row sits below the links and aligns with the first column", async ({ page }) => {
  for (const locale of ["zh", "en"]) {
    await page.goto("/" + locale);
    await expect(page.locator("footer")).toHaveCount(1);
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    const nav = footer.getByRole("navigation");
    const archive = await nav.getByRole("link", { name: locale === "zh" ? "归档" : "Archive", exact: true }).boundingBox();
    const about = await nav.getByRole("link", { name: locale === "zh" ? "关于" : "About", exact: true }).boundingBox();
    const rss = await nav.getByRole("link", { name: "RSS", exact: true }).boundingBox();
    const row = await footer.locator("[data-language-switch]").boundingBox();
    expect(Math.abs(row!.x - archive!.x)).toBeLessThan(1);
    expect(Math.abs(row!.x - about!.x)).toBeLessThan(1);
    expect(row!.y).toBeGreaterThan(rss!.y + rss!.height);
  }
});

test("local IP lookup supports China IPv4 and IPv6 and ignores visitor country headers", async ({ request }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL) || !process.env.GEOIP_DATABASE_PATH, "requires local trusted edge simulation and a real database");
  for (const ip of ["114.114.114.114", "2400:3200::1", "::ffff:114.114.114.114"]) {
    const response = await request.get("/", { maxRedirects: 0, headers: { "x-real-ip": ip, "cf-ipcountry": "US" } });
    expect(response.headers()["location"]).toContain("/zh");
  }
  const foreign = await request.get("/", { maxRedirects: 0, headers: { "x-real-ip": "8.8.8.8", "cf-ipcountry": "CN" } });
  expect(foreign.headers()["location"]).toContain("/en");
  const malformed = await request.get("/", { maxRedirects: 0, headers: { "x-real-ip": "bad-ip", "cf-ipcountry": "CN" } });
  expect(malformed.headers()["location"]).toContain("/en");
});
