import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { articleInput } from "@/test/factories";
import { localizedPath, switchLocalePath, localeCookie } from "@/lib/i18n/locale";

const { cookieSet, country } = vi.hoisted(() => ({ cookieSet: vi.fn(), country: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock("@/lib/i18n/geoip", async (original) => ({ ...await original<typeof import("@/lib/i18n/geoip")>(), lookupCountry: country }));
vi.mock("@/app/studio/api/_helpers", () => ({ requireApiAdmin: vi.fn(async () => null), apiError: (error: unknown) => { throw error; } }));
let dir: string;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-i18n-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("SITE_URL", "https://example.com");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "scrypt$16384$8$1$c2FsdA==$aGFzaA==");
  vi.stubEnv("SESSION_SECRET", "0123456789abcdefghijklmnopqrstuvwxyzABCDEF");
  (await import("@/lib/db/connection")).closeDb();
  (await import("@/lib/db/migrate")).migrate();
  country.mockReset(); cookieSet.mockReset();
});
afterEach(async () => {
  (await import("@/lib/db/connection")).closeDb();
  fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs();
});
describe("language entry routing", () => {
  it("uses trusted real IP only, cookie priority, explicit URL priority and uncached 307 redirects", async () => {
    const { proxy } = await import("@/proxy");
    country.mockReturnValue("CN");
    const response = await proxy(new NextRequest("https://example.com/search?q=term&page=2", { headers: { "x-real-ip": "2001:db8::1", "cf-ipcountry": "US" } }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/zh/search?q=term&page=2");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(country).toHaveBeenCalledWith("2001:db8::1");
    const cookie = await proxy(new NextRequest("https://example.com/archive", { headers: { cookie: `${localeCookie}=en` } }));
    expect(cookie.headers.get("location")).toBe("https://example.com/en/archive");
    const explicit = await proxy(new NextRequest("https://example.com/zh/archive?lang=en", { headers: { cookie: `${localeCookie}=en` } }));
    expect(explicit.headers.get("location")).toBeNull();
    country.mockReturnValue(null);
    expect((await proxy(new NextRequest("https://example.com/unknown"))).headers.get("location")).toBe("https://example.com/en/unknown");
  });
  it("handles old links while excluding operational routes and proof files", async () => {
    const { proxy } = await import("@/proxy");
    expect((await proxy(new NextRequest("https://example.com/society/post?lang=en&page=2&q=hi"))).headers.get("location")).toBe("https://example.com/en/society/post?page=2&q=hi");
    for (const route of ["/studio/login", "/media/photo.webp", "/og", "/healthz", "/version", "/internal/revalidate", "/robots.txt", "/sitemap.xml", "/feed.xml", "/proofs/1/source", "/proofs/1/ots", "/en/feed.xml"]) {
      expect((await proxy(new NextRequest("https://example.com" + route))).headers.get("location")).toBeNull();
    }
  });
  it("preserves page, query and hash and blocks external/Studio switch targets", async () => {
    expect(localizedPath("/zh/archive?page=2", "en")).toBe("/en/archive?page=2");
    expect(switchLocalePath("/en/search?q=城市&page=2#results", "zh")).toBe("/zh/search?q=%E5%9F%8E%E5%B8%82&page=2#results");
    for (const target of ["https://evil.com/a", "//evil.com", "/studio/settings", "/internal/revalidate"]) expect(switchLocalePath(target, "en")).toBe("/en");
    const { setLocale } = await import("@/lib/i18n/actions");
    const data = new FormData(); data.set("locale", "en"); data.set("returnTo", "/zh/archive?page=2#entries");
    await expect(setLocale(data)).rejects.toMatchObject({ digest: expect.stringContaining("/en/archive?page=2#entries") });
    expect(cookieSet).toHaveBeenCalledWith(localeCookie, "en", expect.objectContaining({ path: "/", maxAge: 31536000, httpOnly: true, sameSite: "lax" }));
  });
});
describe("bilingual article presentation", () => {
  async function article(overrides: Partial<ReturnType<typeof articleInput>> = {}) {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    return publishArticle(createArticle(articleInput({ slug: "bilingual", titleZh: "中文标题", bodyZh: "中文正文与搜索词", excerptZh: "中文摘要", titleEn: "English title", bodyEn: "English body with **needle** and context.", excerptEn: "", ...overrides })).id);
  }
  it("selects complete translations, derives English excerpts, and falls back as a whole", async () => {
    const { articleDisplay } = await import("@/lib/i18n/article");
    const full = await article();
    expect(articleDisplay(full, "en")).toMatchObject({ locale: "en", title: "English title", excerpt: "English body with needle and context." });
    expect(articleDisplay(full, "zh")).toMatchObject({ locale: "zh", title: "中文标题", excerpt: "中文摘要" });
    expect(articleDisplay({ ...full, bodyEn: "", bodyEnPath: null }, "en")).toMatchObject({ locale: "zh", title: "中文标题", excerpt: "中文摘要" });
    expect(articleDisplay({ ...full, titleEn: "" }, "en").locale).toBe("zh");
  });
  it("searches both languages and displays snippets from the selected article language", async () => {
    await article();
    const { searchArticleResults } = await import("@/lib/services/search");
    const en = searchArticleResults("needle", { locale: "en" });
    expect(en.total).toBe(1);
    expect(en.results[0]!.excerptParts.map((p) => p.text).join("")).toContain("English body");
    expect(en.results[0]!.excerptParts.some((p) => p.text === "needle" && p.highlighted)).toBe(true);
    const zh = searchArticleResults("needle");
    expect(zh.results[0]!.excerptParts.map((p) => p.text).join("")).toContain("中文");
    expect(zh.results[0]!.excerptParts.map((p) => p.text).join("")).not.toContain("English body");
  });
  it("uses localized canonical/alternates, fallback canonical and stable legacy RSS GUIDs", async () => {
    const full = await article();
    const { articleMetadata } = await import("@/lib/metadata");
    const { renderRss } = await import("@/lib/rss");
    expect(articleMetadata(full, "en")).toMatchObject({ title: "English title", alternates: { canonical: "https://example.com/en/commentary/bilingual", languages: { "zh-CN": "https://example.com/zh/commentary/bilingual", en: "https://example.com/en/commentary/bilingual" } } });
    const fallback = { ...full, titleEn: "", bodyEn: "", bodyEnPath: null };
    const metadata = articleMetadata(fallback, "en");
    expect(metadata.alternates?.canonical).toBe("https://example.com/zh/commentary/bilingual");
    expect(metadata.alternates?.languages).not.toHaveProperty("en");
    const legacy = renderRss([full], "description");
    const en = renderRss([full, { ...fallback, slug: "fallback" }], "description", "en");
    expect(legacy).toContain("<guid>https://example.com/commentary/bilingual</guid>");
    expect(en).toContain("<guid>https://example.com/commentary/bilingual</guid>");
    expect(en).toContain("<link>https://example.com/en/commentary/bilingual</link>");
    expect(en).toContain("<title>English title</title>");
    expect(en).toContain("<title>中文标题</title>");
  });
  it("preserves Chinese settings omitted by old requests", async () => {
    const { getSettings, setSetting } = await import("@/lib/services/settings");
    const { PUT } = await import("@/app/studio/api/settings/route");
    setSetting("aboutZh", "新的中文介绍"); setSetting("rssDescriptionZh", "新的中文 RSS");
    const { aboutZh: _about, rssDescriptionZh: _rss, ...old } = getSettings();
    expect((await PUT(new Request("https://example.com/studio/api/settings", { method: "PUT", body: JSON.stringify({ ...old, about: "Updated English" }) }))).status).toBe(200);
    expect(getSettings()).toMatchObject({ aboutZh: "新的中文介绍", rssDescriptionZh: "新的中文 RSS", about: "Updated English" });
  });
});
