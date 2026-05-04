import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArticlePage } from "@/app/_articlePage";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-public-"));
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

describe("public article pages", () => {
  it("renders an article cover image when one is configured", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "有封面的文章",
        slug: "with-cover",
        category: "society",
        coverImagePath: "uploads/2026/05/cover.webp",
        bodyZh: "正文。",
      }),
    );
    publishArticle(article.id);

    render(await ArticlePage({ category: "society", slug: "with-cover" }));

    const image = screen.getByRole("img", { name: "有封面的文章" });
    expect(image).toHaveAttribute("src", "/media/2026/05/cover.webp");
  });
});
