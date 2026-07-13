import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

vi.mock("@/app/studio/api/_helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/studio/api/_helpers")>()),
  requireApiAdmin: vi.fn(async () => null),
}));

vi.mock("@/lib/services/publication-proofs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/publication-proofs")>()),
  createPublicationProof: vi.fn(async () => null),
}));

vi.mock("@/lib/translation/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/service")>()),
  translatePublishedMissingEnglish: vi.fn(),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-proof-triggers-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
  const { createPublicationProof } = await import("@/lib/services/publication-proofs");
  vi.mocked(createPublicationProof).mockClear();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("publication-proof mutation triggers", () => {
  it("runs after first publication and later published edits, but not draft edits", async () => {
    const { createArticle } = await import("@/lib/services/articles");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    const article = createArticle(articleInput());
    const updateRoute = await import("@/app/studio/api/articles/[id]/route");
    const publishRoute = await import("@/app/studio/api/articles/[id]/publish/route");
    const context = { params: Promise.resolve({ id: String(article.id) }) };

    await updateRoute.PUT(
      new Request("http://localhost/studio/api/articles/1", { method: "PUT", body: JSON.stringify(articleInput({ bodyZh: "草稿修改" })) }),
      context,
    );
    expect(createPublicationProof).not.toHaveBeenCalled();

    await publishRoute.POST(new Request("http://localhost/studio/api/articles/1/publish", { method: "POST" }), context);
    expect(createPublicationProof).toHaveBeenCalledOnce();

    await updateRoute.PUT(
      new Request("http://localhost/studio/api/articles/1", { method: "PUT", body: JSON.stringify(articleInput({ bodyZh: "发布后修改" })) }),
      context,
    );
    expect(createPublicationProof).toHaveBeenCalledTimes(2);
  });

  it("runs for published articles changed by batch translation", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    const { translatePublishedMissingEnglish } = await import("@/lib/translation/service");
    const article = publishArticle(createArticle(articleInput()).id);
    vi.mocked(translatePublishedMissingEnglish).mockResolvedValue({
      summary: { attempted: 1, succeeded: 1, failed: 0 },
      successes: [{ id: article.id, titleZh: article.titleZh }],
      failures: [],
    });
    const route = await import("@/app/studio/api/translations/published-missing/route");

    await route.POST(new Request("http://localhost/studio/api/translations/published-missing", { method: "POST" }));

    expect(createPublicationProof).toHaveBeenCalledOnce();
  });
});
