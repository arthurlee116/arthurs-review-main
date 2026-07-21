import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import {
  PUBLIC_ARTICLE_LIST_TAG,
  PUBLIC_PROOFS_TAG,
  PUBLIC_SETTINGS_TAG,
  invalidateArticleLists,
  invalidateArticlePublication,
  invalidateProofs,
  invalidateSettings,
  publicArticleProofsTag,
  publicArticleTag,
} from "@/lib/services/public-cache";

describe("public cache invalidation", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
  });

  it("expires only article lists and the old/new public paths after Publish", () => {
    invalidateArticlePublication({
      oldPath: { category: "commentary", slug: "old-path" },
      newPath: { category: "society", slug: "new-path" },
    });

    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      [PUBLIC_ARTICLE_LIST_TAG, { expire: 0 }],
      [publicArticleTag("commentary", "old-path"), { expire: 0 }],
      [publicArticleTag("society", "new-path"), { expire: 0 }],
    ]);
  });

  it("deduplicates an unchanged article path", () => {
    invalidateArticlePublication({
      oldPath: { category: "commentary", slug: "same-path" },
      newPath: { category: "commentary", slug: "same-path" },
    });

    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      [PUBLIC_ARTICLE_LIST_TAG, { expire: 0 }],
      [publicArticleTag("commentary", "same-path"), { expire: 0 }],
    ]);
  });

  it("keeps settings, proofs, lists, and article bodies in separate domains", () => {
    invalidateSettings();
    invalidateProofs(7);
    invalidateArticleLists();

    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      [PUBLIC_SETTINGS_TAG, { expire: 0 }],
      [PUBLIC_PROOFS_TAG, { expire: 0 }],
      [publicArticleProofsTag(7), { expire: 0 }],
      [PUBLIC_ARTICLE_LIST_TAG, { expire: 0 }],
    ]);
  });

  it("assigns each cached query to its narrow resource tag", () => {
    const source = fs.readFileSync("src/lib/services/public-content.ts", "utf8");

    expect(source).toContain("PUBLIC_ARTICLE_LIST_TAG");
    expect(source).toContain("publicArticleTag(category, slug)");
    expect(source).toContain("PUBLIC_SETTINGS_TAG");
    expect(source).toContain("PUBLIC_PROOFS_TAG");
    expect(source).toContain("publicArticleProofsTag(articleId)");
    expect(source).not.toContain("PUBLIC_CONTENT_TAG");
  });

  it("uses resource-specific invalidation in every public mutation route", () => {
    expect(fs.readFileSync("src/app/studio/api/articles/[id]/publish/route.ts", "utf8")).toContain("invalidateArticlePublication");
    expect(fs.readFileSync("src/app/studio/api/articles/[id]/unpublish/route.ts", "utf8")).toContain("invalidateArticlePublication");
    expect(fs.readFileSync("src/app/studio/api/articles/[id]/featured/route.ts", "utf8")).toContain("invalidateArticleLists");
    expect(fs.readFileSync("src/app/studio/api/settings/route.ts", "utf8")).toContain("invalidateSettings");
    expect(fs.readFileSync("src/app/studio/api/articles/_publicationProof.ts", "utf8")).toContain("invalidateProofs");
  });
});
