import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";
import { encodeFloat32Vector } from "@/lib/semantic/vector";
import { SemanticServiceError } from "@/lib/semantic/client";

let tmpDir: string;

const identity = { modelId: "test/hybrid-embedding", modelRevision: "fixed", dimension: 2 };

function fakeClient({
  embedError,
  rerank,
}: {
  embedError?: Error;
  rerank?: (query: string, candidates: readonly { id: string; text: string }[]) => Promise<Array<{ id: string; score: number }>>;
} = {}) {
  return {
    config: {
      baseUrl: "http://semantic.test",
      embedding: identity,
      reranker: { modelId: "test/reranker", modelRevision: "fixed" },
      embedTimeoutMs: 100,
      rerankTimeoutMs: 100,
    },
    embed: vi.fn(async () => {
      if (embedError) throw embedError;
      return { vectors: [new Float32Array([1, 0])], tokenCounts: [3] };
    }),
    rerank: vi.fn(rerank ?? (async (_query, candidates) => candidates.map((candidate) => ({ id: candidate.id, score: 0 })))),
  };
}

async function insertEmbedding(
  article: { id: number; revisionId: number },
  vector: readonly number[],
  content: string,
  chunkIndex = 0,
) {
  const { getDb } = await import("@/lib/db/connection");
  getDb()
    .prepare(
      `insert into article_embedding_chunks(
         article_id, revision_id, model_id, model_revision, dimension, chunk_index,
         language, content, token_count, embedding, created_at
       ) values (?, ?, ?, ?, ?, ?, 'zh', ?, 10, ?, ?)`,
    )
    .run(
      article.id,
      article.revisionId,
      identity.modelId,
      identity.modelRevision,
      identity.dimension,
      chunkIndex,
      content,
      encodeFloat32Vector(vector),
      "2026-07-21T00:00:00.000Z",
    );
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-hybrid-search-"));
  process.env.DATA_DIR = tmpDir;
  delete process.env.SEMANTIC_SEARCH_URL;
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("hybrid public search", () => {
  it("takes 30 distinct FTS articles and 30 distinct dense articles before article-level RRF", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResultsHybrid } = await import("@/lib/services/search");
    for (let index = 1; index <= 35; index += 1) {
      const article = publishArticle(
        createArticle(
          articleInput({
            titleZh: `混合候选 ${index}`,
            slug: `hybrid-candidate-${index}`,
            excerptZh: "混合检索摘要",
            bodyZh: index > 30 ? "共同 ".repeat(30) : "共同",
          }),
        ).id,
      );
      const cosine = 1 - index / 1_000;
      await insertEmbedding(article, [cosine, Math.sqrt(1 - cosine * cosine)], `dense chunk ${index}`);
    }
    const client = fakeClient();
    const traces: unknown[] = [];

    const first = await searchArticleResultsHybrid("共同", {
      client,
      rerankEnabled: false,
      onTrace: (trace) => traces.push(trace),
    });
    const last = await searchArticleResultsHybrid("共同", { client, rerankEnabled: false, page: 4 });

    expect(first.total).toBe(35);
    expect(first.totalPages).toBe(4);
    expect(first.results).toHaveLength(10);
    expect(last.page).toBe(4);
    expect(last.results).toHaveLength(5);
    expect(new Set([...first.results, ...last.results].map((result) => result.article.id)).size).toBe(15);
    expect(client.embed).toHaveBeenCalledWith("query", ["共同"]);
    expect(traces).toHaveLength(1);
    const trace = traces[0] as {
      fts: Array<Record<string, unknown>>;
      dense: Array<Record<string, unknown>>;
      final: Array<Record<string, unknown>>;
    };
    expect(trace.fts).toHaveLength(30);
    expect(trace.dense).toHaveLength(30);
    expect(trace.final).toHaveLength(35);
    expect(trace.fts[0]).toMatchObject({ rank: 1, score: expect.any(Number) });
    expect(trace.dense[0]).toMatchObject({ rank: 1, cosineScore: expect.any(Number), chunkIndex: expect.any(Number) });
    expect(trace.final[0]).toMatchObject({
      rank: 1,
      rrfScore: expect.any(Number),
      ftsRank: expect.any(Number),
      denseRank: expect.any(Number),
    });
  });

  it("returns a readable unhighlighted best chunk for a dense-only hit", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResultsHybrid } = await import("@/lib/services/search");
    const article = publishArticle(
      createArticle(
        articleInput({
          titleZh: "康德与人的目的",
          slug: "kant-dense-only",
          excerptZh: "不要把任何人仅仅当作工具",
          bodyZh: "道德哲学要求尊重主体，而不是计算市场交换价格。",
        }),
      ).id,
    );
    await insertEmbedding(article, [1, 0], "人必须永远同时被当作目的，而不只是手段。这个原则讨论人的尊严。");

    const page = await searchArticleResultsHybrid("什么观念反对工具化他人", {
      client: fakeClient(),
      rerankEnabled: false,
    });

    expect(page.results.map((result) => result.article.slug)).toEqual(["kant-dense-only"]);
    expect(page.results[0]?.excerptParts).toEqual([
      { text: "人必须永远同时被当作目的，而不只是手段。这个原则讨论人的尊严。", highlighted: false },
    ]);
  });

  it("falls back to the complete legacy FTS pagination when query embedding fails", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResultsHybrid } = await import("@/lib/services/search");
    for (let index = 1; index <= 31; index += 1) {
      const article = publishArticle(
        createArticle(articleInput({ titleZh: `完整降级 ${index}`, slug: `full-fallback-${index}`, bodyZh: "降级检索词" })).id,
      );
      await insertEmbedding(article, [1, 0], `chunk ${index}`);
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const page = await searchArticleResultsHybrid("降级检索词", {
      client: fakeClient({ embedError: new SemanticServiceError("sidecar down", "timeout") }),
      page: 4,
    });

    expect(page).toMatchObject({ page: 4, total: 31, totalPages: 4 });
    expect(page.results).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      "Semantic search fallback",
      expect.objectContaining({ stage: "embed", reason: "timeout" }),
    );
    warn.mockRestore();
  });

  it("reranks only the fused top ten and keeps the RRF order if reranking fails", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResultsHybrid } = await import("@/lib/services/search");
    for (let index = 1; index <= 12; index += 1) {
      const article = publishArticle(
        createArticle(articleInput({ titleZh: `重排文章 ${index}`, slug: `rerank-${index}`, bodyZh: "重排共同词" })).id,
      );
      const cosine = 1 - index / 100;
      await insertEmbedding(article, [cosine, Math.sqrt(1 - cosine * cosine)], `rerank passage ${index}`);
    }
    const baseline = await searchArticleResultsHybrid("重排共同词", {
      client: fakeClient(),
      rerankEnabled: false,
      pageSize: 20,
    });
    const reversingClient = fakeClient({
      rerank: async (_query, candidates) => candidates.map((candidate, index) => ({ id: candidate.id, score: index })),
    });
    const reranked = await searchArticleResultsHybrid("重排共同词", {
      client: reversingClient,
      rerankEnabled: true,
      pageSize: 20,
    });

    expect(reranked.results.slice(0, 10).map((result) => result.article.id)).toEqual(
      baseline.results.slice(0, 10).map((result) => result.article.id).reverse(),
    );
    expect(reranked.results.slice(10).map((result) => result.article.id)).toEqual(
      baseline.results.slice(10).map((result) => result.article.id),
    );
    expect(reversingClient.rerank).toHaveBeenCalledOnce();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failingClient = fakeClient({ rerank: async () => { throw new Error("reranker down"); } });
    const degraded = await searchArticleResultsHybrid("重排共同词", {
      client: failingClient,
      rerankEnabled: true,
      pageSize: 20,
    });
    expect(degraded.results.map((result) => result.article.id)).toEqual(baseline.results.map((result) => result.article.id));
    expect(warn).toHaveBeenCalledWith("Semantic search fallback", expect.objectContaining({ stage: "rerank" }));
    warn.mockRestore();
  });

  it("does not contact the model for blank or punctuation-only input", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResultsHybrid } = await import("@/lib/services/search");
    const article = publishArticle(
      createArticle(articleInput({ titleZh: "纯标点不应语义召回", slug: "punctuation-must-stay-empty" })).id,
    );
    await insertEmbedding(article, [1, 0], "这个向量行使测试走过真实 dense 前置条件。");
    const client = fakeClient();

    await expect(searchArticleResultsHybrid("!!!", { client })).resolves.toMatchObject({ total: 0, results: [] });
    expect(client.embed).not.toHaveBeenCalled();
  });
});
