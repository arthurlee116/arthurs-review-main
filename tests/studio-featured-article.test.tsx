import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-featured-studio-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  router.refresh.mockReset();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("featured article controls in Studio", () => {
  it("marks the current featured article and only offers published alternatives", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle, setFeaturedArticle } = await import("@/lib/services/articles");
    const { default: ArticlesPage } = await import("@/app/studio/(protected)/articles/page");
    migrate();

    const current = publishArticle(createArticle(articleInput({ titleZh: "当前封面", slug: "current-featured" })).id);
    publishArticle(createArticle(articleInput({ titleZh: "候选文章", slug: "featured-alternative" })).id);
    createArticle(articleInput({ titleZh: "草稿文章", slug: "featured-draft" }));
    setFeaturedArticle(current.id);

    render(await ArticlesPage({ searchParams: Promise.resolve({}) }));

    const currentRow = screen.getByRole("link", { name: "当前封面" }).closest("li")!;
    const alternativeRow = screen.getByRole("link", { name: "候选文章" }).closest("li")!;
    const draftRow = screen.getByRole("link", { name: "草稿文章" }).closest("li")!;
    expect(within(currentRow).getByText("推荐")).toBeVisible();
    expect(within(currentRow).getByRole("button", { name: "取消推荐：当前封面" })).toBeVisible();
    expect(within(alternativeRow).getByRole("button", { name: "设为推荐：候选文章" })).toBeVisible();
    expect(within(draftRow).queryByRole("button")).not.toBeInTheDocument();
  });

  it("sets a published article as featured and refreshes the list", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => Response.json({ article: { id: 2, isFeatured: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { default: ArticlesPage } = await import("@/app/studio/(protected)/articles/page");
    migrate();
    const article = publishArticle(createArticle(articleInput({ titleZh: "设为封面", slug: "set-featured" })).id);

    render(await ArticlesPage({ searchParams: Promise.resolve({}) }));
    await user.click(screen.getByRole("button", { name: "设为推荐：设为封面" }));

    expect(fetchMock).toHaveBeenCalledWith(`/studio/api/articles/${article.id}/featured`, expect.objectContaining({ method: "POST" }));
    expect(await screen.findByRole("status")).toHaveTextContent("已设为推荐");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("filters in SQL and paginates the Studio list at 50 articles", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle } = await import("@/lib/services/articles");
    const { default: ArticlesPage } = await import("@/app/studio/(protected)/articles/page");
    migrate();
    for (let index = 1; index <= 51; index += 1) {
      createArticle(articleInput({ titleZh: `Studio 文章 ${index}`, slug: `studio-page-${index}` }));
    }
    const prepare = vi.spyOn(getDb(), "prepare");

    render(await ArticlesPage({ searchParams: Promise.resolve({ status: "draft", category: "commentary", q: "Studio", page: "2" }) }));

    expect(screen.getByRole("link", { name: "Studio 文章 1" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Studio 文章 2" })).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", expect.stringContaining("status=draft"));
    const pageQuery = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => /limit\s+\?\s+offset\s+\?/i.test(sql));
    expect(pageQuery).toContain("article_revision_tags");
    prepare.mockRestore();
  });

  it("removes a recommendation using DELETE and hides the control on public life posts", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => Response.json({ article: { isFeatured: false } }));
    vi.stubGlobal("fetch", fetchMock);
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle, setFeaturedArticle } = await import("@/lib/services/articles");
    const { default: ArticlesPage } = await import("@/app/studio/(protected)/articles/page");
    migrate();
    const article = publishArticle(createArticle(articleInput({ titleZh: "推荐文字", slug: "recommended-text" })).id);
    publishArticle(createArticle(articleInput({ titleZh: "相册", slug: "photos", category: "life" })).id);
    setFeaturedArticle(article.id);
    render(await ArticlesPage({ searchParams: Promise.resolve({}) }));
    expect(within(screen.getByRole("link", { name: "相册" }).closest("li")!).queryByRole("button")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消推荐：推荐文字" }));
    expect(fetchMock).toHaveBeenCalledWith(`/studio/api/articles/${article.id}/featured`, expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByRole("status")).toHaveTextContent("已取消推荐");
  });
});
