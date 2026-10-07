import fs from "node:fs/promises";
import { expect, test } from "./fixtures";

const token = process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
const beaconSelector = 'script[data-cf-beacon]';

test("analytics stays disabled when the build has no token", async ({ page }) => {
  test.skip(Boolean(token), "This build has analytics enabled");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Arthur's Review" })).toBeVisible();
  await expect(page.locator(beaconSelector)).toHaveCount(0);
});

test("analytics uses one official beacon across SPA navigation and history", async ({ page, request }) => {
  test.skip(!token, "No analytics token configured");
  const localBeacon = process.env.E2E_CLOUDFLARE_BEACON_PATH;
  let source: string;
  if (localBeacon) source = await fs.readFile(localBeacon, "utf8");
  else {
    const response = await request.get("https://static.cloudflareinsights.com/beacon.min.js");
    expect(response.ok()).toBe(true);
    source = await response.text();
  }
  const payloads: Array<{ location?: string; siteToken?: string }> = [];
  let downloads = 0;
  await page.route("https://static.cloudflareinsights.com/**", async (route) => {
    downloads += 1;
    await route.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: source });
  });
  await page.route("https://cloudflareinsights.com/**", async (route) => {
    if (route.request().method() === "POST") payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  });

  await page.goto("/");
  const beacon = page.locator(beaconSelector);
  await expect(beacon).toHaveCount(1);
  await expect(beacon).toHaveAttribute("type", "module");
  await expect(beacon).toHaveAttribute("data-cf-beacon", JSON.stringify({ token }));
  // Keep the same document; a hard reload would hide a broken SPA integration.
  await page.evaluate(() => { document.documentElement.dataset.analyticsDocument = "initial"; });
  await expect.poll(() => payloads.length).toBeGreaterThan(0);
  await page.getByRole("navigation").first().getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.getByRole("navigation").first().getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect.poll(() => payloads.some((value) => value.location?.endsWith("/about"))).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/archive$/);
  await expect.poll(() => payloads.filter((value) => value.location?.endsWith("/about")).length).toBeGreaterThan(1);
  expect(await page.locator("html").getAttribute("data-analytics-document")).toBe("initial");
  await expect(beacon).toHaveCount(1);
  expect(downloads).toBe(1);
  expect(payloads.every((value) => value.siteToken === token)).toBe(true);
});

test("analytics is absent from Studio login, editor and draft previews", async ({ page }) => {
  await page.goto("/studio/login");
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.locator(beaconSelector)).toHaveCount(0);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/studio\/articles/);
  await expect(page.locator(beaconSelector)).toHaveCount(0);
  await page.getByRole("link", { name: "New article", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
  await expect(page.locator(beaconSelector)).toHaveCount(0);
  // Seeded article previews use the private renderer, not PublicShell.
  await page.goto("/studio/preview/1");
  await expect(page.locator("main article h1")).toBeVisible();
  await expect(page.locator(beaconSelector)).toHaveCount(0);
});

test("analytics stays disabled for public pages on the Studio hostname", async ({ page, baseURL }) => {
  // Route a private hostname to the test server without changing DNS or TLS.
  const privateOrigin = "http://studio.analytics.test";
  await page.route(`${privateOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto(`${privateOrigin}/about`);
  await expect(page.getByRole("navigation").first().getByRole("link", { name: "About", exact: true })).toHaveAttribute("aria-current", "page");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(beaconSelector)).toHaveCount(0);
});

test("public pages keep working when the analytics script is blocked", async ({ page }) => {
  await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort("blockedbyclient"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Arthur's Review" })).toBeVisible();
  await page.getByRole("navigation").first().getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("main")).toBeVisible();
});
