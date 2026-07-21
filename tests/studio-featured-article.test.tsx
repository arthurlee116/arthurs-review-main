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
    const alternative = publishArticle(createArticle(articleInput({ titleZh: "候选文章", slug: "featured-alternative" })).id);
    createArticle(articleInput({ titleZh: "草稿文章", slug: "featured-draft" }));
    setFeaturedArticle(current.id);

    render(await ArticlesPage({ searchParams: Promise.resolve({}) }));

    const currentRow = screen.getByRole("link", { name: "当前封面" }).closest("li")!;
    const alternativeRow = screen.getByRole("link", { name: "候选文章" }).closest("li")!;
    const draftRow = screen.getByRole("link", { name: "草稿文章" }).closest("li")!;
    expect(within(currentRow).getByText("Featured")).toBeVisible();
    expect(within(currentRow).queryByRole("button")).not.toBeInTheDocument();
    expect(within(alternativeRow).getByRole("button", { name: "Set 候选文章 as featured article" })).toBeVisible();
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
    await user.click(screen.getByRole("button", { name: "Set 设为封面 as featured article" }));

    expect(fetchMock).toHaveBeenCalledWith(`/studio/api/articles/${article.id}/featured`, expect.objectContaining({ method: "POST" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Featured article updated");
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
});
