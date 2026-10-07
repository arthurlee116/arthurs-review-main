import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";
import { createArticle, publishArticle, setFeaturedArticle, clearFeaturedArticle, unpublishArticle, deleteArticle, updateArticle, listPublishedArticles, listPublishedArticlePage } from "@/lib/services/articles";
import { getDb, closeDb } from "@/lib/db/connection";
import { migrate } from "@/lib/db/migrate";
import { RecommendedContent } from "@/app/[locale]/recommended/page";
import { ArchiveContent } from "@/app/[locale]/archive/page";
import { HomeContent } from "@/app/[locale]/page";

vi.mock("@/app/studio/api/_helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/studio/api/_helpers")>()),
  requireApiAdmin: vi.fn(async () => null),
}));

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-recommended-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  closeDb();
  migrate();
});
afterEach(() => { closeDb(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

function publish(slug: string, category: "commentary" | "life" = "commentary") {
  return publishArticle(createArticle(articleInput({ slug, titleZh: slug, category })).id);
}

describe("recommendations and public list eligibility", () => {
  it("keeps multiple recommendations independent through cancel, unpublish, delete and category changes", () => {
    const articles = ["one", "two", "three", "four", "five"].map((slug) => publish(slug));
    for (const article of articles) setFeaturedArticle(article.id);
    expect(listPublishedArticles(undefined, { featuredOnly: true })).toHaveLength(5);
    clearFeaturedArticle(articles[0].id);
    unpublishArticle(articles[1].id);
    deleteArticle(articles[2].id);
    updateArticle(articles[3].id, articleInput({ slug: "four", category: "life" }), articles[3].draftRevisionId);
    publishArticle(articles[3].id);
    expect(listPublishedArticles(undefined, { featuredOnly: true }).map((article) => article.id)).toEqual([articles[4].id]);
  });

  it("uses the published category rather than an unpublished life draft", () => {
    const article = publish("public-text");
    updateArticle(article.id, articleInput({ slug: "life-draft", category: "life" }), article.draftRevisionId);
    setFeaturedArticle(article.id);
    expect(listPublishedArticles(undefined, { featuredOnly: true })[0].slug).toBe("public-text");
    const life = publish("public-life", "life");
    expect(() => setFeaturedArticle(life.id)).toThrow("Life posts cannot be recommended.");
  });

  it("excludes life before counting and limiting, and keeps recommendations chronological", async () => {
    const first = publish("older-text");
    const second = publish("newer-text");
    const life = publish("newest-life", "life");
    getDb().prepare("update articles set published_at = ? where id = ?").run("2026-01-01T00:00:00Z", first.id);
    getDb().prepare("update articles set published_at = ? where id = ?").run("2026-02-01T00:00:00Z", second.id);
    getDb().prepare("update articles set published_at = ? where id = ?").run("2026-03-01T00:00:00Z", life.id);
    setFeaturedArticle(second.id);
    setFeaturedArticle(first.id);
    // Even a leftover flag on a legacy life article cannot bypass list eligibility.
    getDb().prepare("update articles set is_featured = 1 where id = ?").run(life.id);
    expect(listPublishedArticles(undefined, { excludeLife: true, limit: 1 })[0].id).toBe(second.id);
    const recommended = listPublishedArticlePage({ featuredOnly: true, pageSize: 1, page: 2 });
    expect(recommended).toMatchObject({ total: 2, totalPages: 2 });
    expect(recommended.items.map((article) => article.id)).toEqual([first.id]);
    const { container, unmount } = render(await HomeContent());
    expect(container.querySelector("main article")).toHaveTextContent("newer-text");
    expect(screen.queryByRole("link", { name: "newest-life" })).not.toBeInTheDocument();
    unmount();
    const archive = render(await ArchiveContent());
    expect(screen.queryByRole("link", { name: "newest-life" })).not.toBeInTheDocument();
    archive.unmount();
    const { GET } = await import("@/app/feed.xml/route");
    expect(await (await GET()).text()).toContain("newest-life");
    const { searchArticleResults } = await import("@/lib/services/search");
    expect(searchArticleResults("newest-life").results.some((result) => result.article.id === life.id)).toBe(true);
  });

  it("paginates all recommendations at 50 and has an empty state", async () => {
    const empty = render(await RecommendedContent());
    expect(screen.getByText("暂时没有推荐文章。")).toBeVisible();
    empty.unmount();
    for (let index = 1; index <= 51; index += 1) setFeaturedArticle(publish(`recommended-${index}`).id);
    render(await RecommendedContent({ page: 2 }));
    expect(screen.getByRole("link", { name: "recommended-1" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "recommended-2" })).not.toBeInTheDocument();
    expect(screen.getByText("第 2 页，共 2 页")).toBeVisible();
  });

  it("ignores the old single-feature setting while saving settings", async () => {
    const first = publish("first"), second = publish("second");
    setFeaturedArticle(first.id); setFeaturedArticle(second.id);
    const { getSettings } = await import("@/lib/services/settings");
    const { PUT } = await import("@/app/studio/api/settings/route");
    for (const featuredArticleId of ["", "999999"]) {
      const response = await PUT(new Request("http://localhost/studio/api/settings", {
        method: "PUT", body: JSON.stringify({ ...getSettings(), featuredArticleId }),
      }));
      expect(response.status).toBe(200);
      expect(listPublishedArticles(undefined, { featuredOnly: true })).toHaveLength(2);
      expect(getSettings()).not.toHaveProperty("featuredArticleId");
    }
  });

  it("adds and removes recommendations through the article API", async () => {
    const article = publish("api-recommendation");
    const { POST, DELETE } = await import("@/app/studio/api/articles/[id]/featured/route");
    const context = { params: Promise.resolve({ id: String(article.id) }) };
    expect((await POST(new Request("http://localhost", { method: "POST" }), context)).status).toBe(200);
    expect(listPublishedArticles(undefined, { featuredOnly: true })).toHaveLength(1);
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), context)).status).toBe(200);
    expect(listPublishedArticles(undefined, { featuredOnly: true })).toHaveLength(0);
  });
});
