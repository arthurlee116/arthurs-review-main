import { expect, test } from "./fixtures";

test("article canonicals and indexing rules arrive in the HTML head for Google crawlers", async ({ page, request }) => {
  const userAgents = [
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
  ];
  for (const locale of ["zh", "en"]) {
    const path = `/${locale}/society/city-bystander`;
    for (const userAgent of userAgents) {
      const response = await request.get(path, { headers: { "user-agent": userAgent } });
      expect(response.ok()).toBe(true);
      expect(response.headers()["x-robots-tag"]).toBeUndefined();
      const head = (await response.text()).split("</head>")[0]!;
      expect(head).toContain('<meta name="robots" content="index, follow"');
      expect(head).toMatch(new RegExp(`<link rel="canonical" href="[^"]*${path}"`));
      expect(head).not.toContain("noindex");
    }
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator("main article")).toHaveAttribute("lang", locale === "zh" ? "zh-CN" : "en-GB");
  }
  await page.goto("/en/commentary/short-note");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/zh\/commentary\/short-note$/);
  for (const [slug, title] of [["short-note", "短评的锋利应该留一点余温"], ["e2e-list-limit-1", "E2E 上限文章 1"]]) {
    const response = await request.get(`/zh/commentary/${slug}`, { headers: { "user-agent": "Googlebot/2.1" } });
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]).toBe(title);
    expect(html).toContain(`/zh/commentary/${slug}"`);
  }
});

test("navigation pages stay crawlable but are excluded from search and the sitemap", async ({ request }) => {
  for (const locale of ["zh", "en"]) {
    for (const path of ["", "/recommended", "/commentary", "/society", "/misc", "/life", "/archive?page=2", "/proofs", "/about", "/search?q=city"]) {
      const response = await request.get(`/${locale}${path}`, { headers: { "user-agent": "Googlebot/2.1" } });
      expect(response.ok()).toBe(true);
      const head = (await response.text()).split("</head>")[0]!;
      expect(head).toContain('<meta name="robots" content="noindex, follow"');
    }
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const locations = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]!);
  expect(locations.length).toBeGreaterThan(0);
  for (const url of locations) {
    expect(new URL(url).pathname).toMatch(/^\/(zh|en)\/(commentary|society|misc|life)\/[^/]+$/);
  }
  expect(locations.some((url) => url.endsWith("/zh/commentary/short-note"))).toBe(true);
  expect(locations.some((url) => url.endsWith("/en/commentary/short-note"))).toBe(false);
});

test("feeds and utility downloads explicitly opt out of indexing", async ({ request }) => {
  for (const path of ["/feed.xml", "/zh/feed.xml", "/en/feed.xml", "/sitemap.xml", "/robots.txt", "/healthz", "/version"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, follow");
  }
  for (const kind of ["source", "ots"]) {
    const response = await request.get(`/proofs/0/${kind}`);
    expect(response.status()).toBe(404);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, follow");
  }
  const feed = await (await request.get("/en/feed.xml")).text();
  expect(feed).toContain("/zh/commentary/short-note</link>");
  expect(feed).not.toContain("/en/commentary/short-note</link>");
  expect(feed).toContain("/en/society/city-bystander</link>");
});
