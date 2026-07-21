import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SearchResults } from "@/app/search/page";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-search-page-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("public search page", () => {
  it("hints the same raw-query limit enforced by the server", async () => {
    const { SearchBox } = await import("@/components/SearchBox");
    const { MAX_SEARCH_CODE_POINTS } = await import("@/lib/services/search");
    render(<SearchBox />);

    expect(screen.getByRole("textbox", { name: "Search" })).toHaveAttribute("maxLength", String(MAX_SEARCH_CODE_POINTS));
  });

  it("renders highlighted results and pagination links", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();

    for (let index = 1; index <= 12; index += 1) {
      const article = createArticle(
        articleInput({
          titleZh: `共同词文章 ${index}`,
          slug: `search-page-${index}`,
          category: "society",
          excerptZh: `共同词摘要 ${index}`,
          seoDescription: `共同词 SEO ${index}`,
          bodyZh: `共同词正文 ${index}`,
        }),
      );
      publishArticle(article.id);
    }

    render(<main>{await SearchResults({ searchParams: Promise.resolve({ q: "共同词", page: "2" }) })}</main>);

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getAllByText("共同词", { selector: "mark" }).length).toBeGreaterThan(0);

    const previous = screen.getByRole("link", { name: "Previous" });
    expect(previous).toHaveAttribute("href", "/search?q=%E5%85%B1%E5%90%8C%E8%AF%8D");

    const next = screen.getByText("Next");
    expect(next).not.toHaveAttribute("href");
  });

  it("does not render result cards or pagination for a blank query", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    render(<main>{await SearchResults({ searchParams: Promise.resolve({}) })}</main>);

    expect(screen.queryByRole("navigation", { name: "Search results pages" })).not.toBeInTheDocument();
    expect(screen.queryByText("No matching articles.")).not.toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("article")).not.toBeInTheDocument();
  });
});
