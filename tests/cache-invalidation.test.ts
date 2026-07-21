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
    for (const route of [
      "src/app/studio/api/articles/[id]/publish/route.ts",
      "src/app/studio/api/articles/[id]/unpublish/route.ts",
      "src/app/studio/api/articles/[id]/featured/route.ts",
      "src/app/studio/api/articles/[id]/route.ts",
      "src/app/studio/api/settings/route.ts",
    ]) {
      const source = fs.readFileSync(route, "utf8");
      expect(source, route).not.toContain("invalidateArticlePublication");
      expect(source, route).not.toContain("invalidateArticleLists");
      expect(source, route).not.toContain("invalidateSettings");
      expect(source, route).not.toContain("invalidateProofs");
    }
    expect(fs.existsSync("src/app/studio/api/articles/_publicationProof.ts")).toBe(false);
    expect(fs.readFileSync("src/lib/services/articles.ts", "utf8")).toContain("enqueuePublishedRevisionJobs");
  });

  it("authenticates and validates the Docker-internal revalidation route", async () => {
    process.env.WORKER_REVALIDATE_SECRET = "test-worker-secret";
    const route = await import("@/app/internal/revalidate/route");
    const unauthorized = await route.POST(
      new Request("http://app:3000/internal/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer wrong", "content-type": "application/json" },
        body: JSON.stringify({ tags: [PUBLIC_ARTICLE_LIST_TAG] }),
      }),
    );
    expect(unauthorized.status).toBe(401);

    const invalid = await route.POST(
      new Request("http://app:3000/internal/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer test-worker-secret", "content-type": "application/json" },
        body: JSON.stringify({ tags: ["not-public"] }),
      }),
    );
    expect(invalid.status).toBe(400);

    const response = await route.POST(
      new Request("http://app:3000/internal/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer test-worker-secret", "content-type": "application/json" },
        body: JSON.stringify({ tags: [PUBLIC_ARTICLE_LIST_TAG, PUBLIC_ARTICLE_LIST_TAG] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(revalidateTag).mock.calls).toEqual([[PUBLIC_ARTICLE_LIST_TAG, { expire: 0 }]]);
    delete process.env.WORKER_REVALIDATE_SECRET;
  });

  it("keeps the internal revalidation endpoint off the public proxy", () => {
    const caddy = fs.readFileSync("deploy/Caddyfile", "utf8");
    expect(caddy).toContain("@internal path /internal/*");
    expect(caddy).toContain("respond @internal 404");
  });
});
