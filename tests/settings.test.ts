import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-settings-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
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

describe("featured article settings", () => {
  it("only allows published articles to become featured", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, listPublishedArticles, publishArticle, setFeaturedArticle } = await import("@/lib/services/articles");
    migrate();

    const draft = createArticle(
      articleInput({
        titleZh: "草稿",
        slug: "draft-feature",
        category: "misc",
      }),
    );
    const published = createArticle(
      articleInput({
        titleZh: "已发布",
        slug: "published-feature",
        category: "misc",
      }),
    );
    publishArticle(published.id);

    expect(() => setFeaturedArticle(draft.id)).toThrow("Featured article must be published.");
    setFeaturedArticle(published.id);

    expect(listPublishedArticles().find((article) => article.isFeatured)?.id).toBe(published.id);
  });

  it("stores the OpenRouter translation model with a sensible default", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { getSetting, setSetting } = await import("@/lib/services/settings");
    migrate();

    expect(getSetting("openrouterTranslationModel")).toBe("inclusionai/ring-2.6-1t:free");

    setSetting("openrouterTranslationModel", "google/gemma-4-31b-it:free");

    expect(getSetting("openrouterTranslationModel")).toBe("google/gemma-4-31b-it:free");
  });
});
