import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { PUBLIC_ARTICLE_LIST_TAG } from "@/lib/services/public-cache";

describe("public cache invalidation", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
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

  it("routes public mutations through the durable jobs outbox", () => {
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
    expect(caddy).toContain("@internal path /internal /internal/*");
    expect(caddy).toContain("respond @internal 404");
  });
});
