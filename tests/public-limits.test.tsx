import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryPage } from "@/app/_categoryPage";
import { HomeContent } from "@/app/page";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-limits-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function publishArticles(count: number) {
  const { migrate } = await import("@/lib/db/migrate");
  const { createArticle, publishArticle } = await import("@/lib/services/articles");
  migrate();
  for (let index = 1; index <= count; index += 1) {
    const draft = createArticle(articleInput({
      titleZh: `文章 ${index}`,
      slug: `article-${index}`,
      category: "commentary",
    }));
    publishArticle(draft.id);
  }
}

describe("public listing limits", () => {
  it("shows at most 12 articles total on the homepage", async () => {
    await publishArticles(15);

    const { getDb } = await import("@/lib/db/connection");
    const prepare = vi.spyOn(getDb(), "prepare");

    const { container } = render(await HomeContent());

    expect(container.querySelectorAll("main article")).toHaveLength(12);
    const articleQuery = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("from articles where status"));
    expect(articleQuery).toMatch(/limit\s+\?/i);
    prepare.mockRestore();
  });

  it("shows at most 8 articles on a category page", async () => {
    await publishArticles(11);

    const { getDb } = await import("@/lib/db/connection");
    const prepare = vi.spyOn(getDb(), "prepare");

    const { container } = render(await CategoryPage({ category: "commentary" }));

    expect(container.querySelectorAll("main article")).toHaveLength(8);
    const articleQuery = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("from articles where status"));
    expect(articleQuery).toMatch(/limit\s+\?/i);
    prepare.mockRestore();
  });

  it("batches published-list tag reads into one query", async () => {
    await publishArticles(4);
    const { getDb } = await import("@/lib/db/connection");
    const { listPublishedArticles } = await import("@/lib/services/articles");
    const prepare = vi.spyOn(getDb(), "prepare");

    listPublishedArticles();

    const tagQueries = prepare.mock.calls.filter(([sql]) => String(sql).includes("join article_tags"));
    expect(tagQueries).toHaveLength(1);
    prepare.mockRestore();
  });

  it("renders the featured article first in the large homepage slot", async () => {
    await publishArticles(15);
    const { listPublishedArticles, setFeaturedArticle } = await import("@/lib/services/articles");
    const oldest = listPublishedArticles().find((article) => article.slug === "article-1")!;
    setFeaturedArticle(oldest.id);

    const { container } = render(await HomeContent());

    const cards = container.querySelectorAll("main article");
    expect(cards[0]).toContainElement(screen.getByRole("link", { name: "文章 1" }));
    expect(cards[0]).toContainElement(screen.getByText("Featured"));
    expect(cards[0].querySelector("h2")).toHaveClass("text-4xl");
  });
});
