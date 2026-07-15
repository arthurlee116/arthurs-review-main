import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";

import { invalidatePublicContent, PUBLIC_CONTENT_TAG } from "@/lib/services/public-cache";

describe("public content cache invalidation", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
  });

  it("expires the one shared public-content tag immediately", () => {
    invalidatePublicContent();

    expect(PUBLIC_CONTENT_TAG).toBe("public-content");
    expect(revalidateTag).toHaveBeenCalledOnce();
    expect(revalidateTag).toHaveBeenCalledWith(PUBLIC_CONTENT_TAG, { expire: 0 });
  });

  it("uses the shared tag in every cached public query", () => {
    const source = fs.readFileSync("src/lib/services/public-content.ts", "utf8");

    expect(source).toContain("PUBLIC_CONTENT_TAG");
    expect(source).not.toContain('cacheTag("public-content")');
  });

  it.each([
    "src/app/studio/api/articles/[id]/route.ts",
    "src/app/studio/api/articles/[id]/publish/route.ts",
    "src/app/studio/api/articles/[id]/unpublish/route.ts",
    "src/app/studio/api/settings/route.ts",
  ])("invalidates after public mutation in %s", (file) => {
    const source = fs.readFileSync(file, "utf8");

    expect(source).toContain("invalidatePublicContent");
  });

  it("keeps proof scheduling and cache invalidation as separate concerns", () => {
    const source = fs.readFileSync("src/app/studio/api/articles/_publicationProof.ts", "utf8");

    expect(source).toContain('from "@/lib/services/public-cache"');
    expect(source).not.toContain("export function invalidatePublicContent");
  });
});
