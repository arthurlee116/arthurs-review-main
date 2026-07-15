import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ArchivePage from "@/app/archive/page";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-archive-"));
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

describe("archive page", () => {
  it("groups every published article by year with dates and category context", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    migrate();

    const recent = publishArticle(createArticle(articleInput({ titleZh: "今年文章", slug: "this-year" })).id);
    const older = publishArticle(createArticle(articleInput({ titleZh: "去年文章", slug: "last-year", category: "society" })).id);
    getDb().prepare("update articles set published_at = ? where id = ?").run("2026-07-01T00:00:00.000Z", recent.id);
    getDb().prepare("update articles set published_at = ? where id = ?").run("2025-12-02T00:00:00.000Z", older.id);

    render(await ArchivePage());

    const currentYear = screen.getByRole("region", { name: "2026" });
    const previousYear = screen.getByRole("region", { name: "2025" });
    expect(within(currentYear).getByRole("link", { name: "今年文章" })).toHaveAttribute("href", "/commentary/this-year");
    expect(within(currentYear).getByText("2026-07-01")).toBeVisible();
    expect(within(previousYear).getByRole("link", { name: "去年文章" })).toHaveAttribute("href", "/society/last-year");
    expect(within(previousYear).getByRole("link", { name: "社会分析" })).toHaveAttribute("href", "/society");
  });
});
