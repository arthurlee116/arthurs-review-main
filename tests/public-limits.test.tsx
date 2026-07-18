import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CategoryPage } from "@/app/_categoryPage";
import HomePage from "@/app/page";
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

    const { container } = render(await HomePage());

    expect(container.querySelectorAll("main article")).toHaveLength(12);
  });

  it("shows at most 8 articles on a category page", async () => {
    await publishArticles(11);

    const { container } = render(await CategoryPage({ category: "commentary" }));

    expect(container.querySelectorAll("main article")).toHaveLength(8);
  });

  it("renders the featured article first in the large homepage slot", async () => {
    await publishArticles(3);
    const { listPublishedArticles, setFeaturedArticle } = await import("@/lib/services/articles");
    const oldest = listPublishedArticles().find((article) => article.slug === "article-1")!;
    setFeaturedArticle(oldest.id);

    const { container } = render(await HomePage());

    const cards = container.querySelectorAll("main article");
    expect(cards[0]).toContainElement(screen.getByRole("link", { name: "文章 1" }));
    expect(cards[0]).toContainElement(screen.getByText("Featured"));
    expect(cards[0].querySelector("h2")).toHaveClass("text-[min(36px,9.2vw)]");
  });

  it("keeps featured titles up to nine characters on one line and balances longer titles", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle, setFeaturedArticle } = await import("@/lib/services/articles");
    migrate();
    const short = publishArticle(createArticle(articleInput({ titleZh: "在AI下人类的未来", slug: "nine-character-title" })).id);
    setFeaturedArticle(short.id);

    const shortPage = render(await HomePage());
    expect(shortPage.container.querySelector("main article h2")).toHaveClass("whitespace-nowrap");
    shortPage.unmount();

    const long = publishArticle(createArticle(articleInput({ titleZh: "社会科学中的科学问题", slug: "ten-character-title" })).id);
    setFeaturedArticle(long.id);

    const longPage = render(await HomePage());
    expect(longPage.container.querySelector("main article h2")).toHaveClass("max-w-[9.5em]", "text-balance");
  });
});
