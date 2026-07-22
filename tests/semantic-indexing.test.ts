import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";
import { encodeFloat32Vector } from "@/lib/semantic/vector";

let tmpDir: string;

const embeddingIdentity = {
  modelId: "test/embedding",
  modelRevision: "fixed-revision",
  dimension: 3,
};

function fakeClient(onEmbed?: () => void | Promise<void>) {
  return {
    config: {
      baseUrl: "http://semantic.test",
      embedding: embeddingIdentity,
      reranker: { modelId: "test/reranker", modelRevision: "fixed-reranker" },
      embedTimeoutMs: 100,
      rerankTimeoutMs: 100,
    },
    embed: vi.fn(async (_kind: "query" | "document", texts: readonly string[]) => {
      await onEmbed?.();
      return {
        vectors: texts.map((_, index) => new Float32Array(index % 2 === 0 ? [1, 0, 0] : [0, 1, 0])),
        tokenCounts: texts.map((_, index) => index + 3),
      };
    }),
  };
}

function insertExistingChunk(articleId: number, revisionId: number, modelRevision = "old-revision") {
  return import("@/lib/db/connection").then(({ getDb }) =>
    getDb()
      .prepare(
        `insert into article_embedding_chunks(
           article_id, revision_id, model_id, model_revision, dimension, chunk_index,
           language, content, token_count, embedding, created_at
         ) values (?, ?, ?, ?, ?, 0, 'zh', 'old vector', 3, ?, ?)`,
      )
      .run(articleId, revisionId, embeddingIdentity.modelId, modelRevision, 3, encodeFloat32Vector([0, 0, 1]), "2026-07-21T00:00:00.000Z"),
  );
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-semantic-indexing-"));
  process.env.DATA_DIR = tmpDir;
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

describe("semantic article indexing", () => {
  it("defaults to small inference batches that fit the constrained sidecar", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { indexPublishedArticleRevision } = await import("@/lib/semantic/indexing");
    const published = publishArticle(
      createArticle(articleInput({ bodyZh: "默认批次不能制造过大的 ONNX token 输出。".repeat(400) })).id,
    );
    const client = fakeClient();

    await indexPublishedArticleRevision(published.id, published.revisionId, { client });

    const batchSizes = client.embed.mock.calls.map((call) => call[1].length);
    expect(batchSizes.length).toBeGreaterThan(1);
    expect(Math.max(...batchSizes)).toBe(4);
  });

  it("embeds the exact published revision in batches and atomically stores every chunk", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const { indexPublishedArticleRevision } = await import("@/lib/semantic/indexing");
    const published = publishArticle(
      createArticle(
        articleInput({
          titleZh: "人的价值",
          excerptZh: "价格不能定义人",
          bodyZh: `## 第一节\n\n${"人不是商品。".repeat(90)}`,
          bodyEn: "A person is not a commodity.",
        }),
      ).id,
    );
    const client = fakeClient();

    await expect(
      indexPublishedArticleRevision(published.id, published.revisionId, {
        client,
        batchSize: 2,
        now: () => new Date("2026-07-21T01:02:03.000Z"),
      }),
    ).resolves.toMatchObject({ status: "indexed", articleId: published.id, revisionId: published.revisionId });

    const rows = getDb()
      .prepare(
        `select article_id, revision_id, model_id, model_revision, dimension, chunk_index,
                language, content, token_count, embedding, created_at
         from article_embedding_chunks order by chunk_index`,
      )
      .all() as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(3);
    expect(client.embed).toHaveBeenCalledTimes(Math.ceil(rows.length / 2));
    expect(rows.map((row) => row.chunk_index)).toEqual(rows.map((_, index) => index));
    expect(rows.every((row) => row.article_id === published.id && row.revision_id === published.revisionId)).toBe(true);
    expect(rows.every((row) => row.model_id === embeddingIdentity.modelId && row.model_revision === embeddingIdentity.modelRevision)).toBe(true);
    expect(rows.every((row) => row.dimension === 3 && Buffer.isBuffer(row.embedding) && (row.embedding as Buffer).length === 12)).toBe(true);
    expect(rows.every((row) => row.created_at === "2026-07-21T01:02:03.000Z")).toBe(true);
  });

  it("does not call the model or disturb current vectors for an already stale revision", async () => {
    const { createArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const { indexPublishedArticleRevision } = await import("@/lib/semantic/indexing");
    const first = publishArticle(createArticle(articleInput({ bodyZh: "第一版" })).id);
    const draft = updateArticle(first.id, articleInput({ bodyZh: "第二版" }), first.draftRevisionId);
    const second = publishArticle(draft.id);
    await insertExistingChunk(second.id, second.revisionId);
    const client = fakeClient();

    await expect(indexPublishedArticleRevision(first.id, first.revisionId, { client })).resolves.toEqual({
      status: "stale",
      articleId: first.id,
      revisionId: first.revisionId,
    });
    expect(client.embed).not.toHaveBeenCalled();
    const { getDb } = await import("@/lib/db/connection");
    expect(getDb().prepare("select content from article_embedding_chunks").all()).toEqual([{ content: "old vector" }]);
  });

  it("rechecks the published pointer after inference and cannot overwrite a newer revision", async () => {
    const { createArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const { indexPublishedArticleRevision } = await import("@/lib/semantic/indexing");
    const first = publishArticle(createArticle(articleInput({ bodyZh: "第一版" })).id);
    const nextDraft = updateArticle(first.id, articleInput({ bodyZh: "模型运行期间发布的第二版" }), first.draftRevisionId);
    await insertExistingChunk(first.id, first.revisionId);
    const client = fakeClient(() => {
      getDb().prepare("update articles set published_revision_id = ? where id = ?").run(nextDraft.draftRevisionId, first.id);
    });

    await expect(indexPublishedArticleRevision(first.id, first.revisionId, { client })).resolves.toEqual({
      status: "stale",
      articleId: first.id,
      revisionId: first.revisionId,
    });
    expect(getDb().prepare("select content from article_embedding_chunks").all()).toEqual([{ content: "old vector" }]);
  });

  it("keeps old vectors when inference or the replacement transaction fails", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const { indexPublishedArticleRevision } = await import("@/lib/semantic/indexing");
    const published = publishArticle(createArticle(articleInput({ bodyZh: "保持旧索引" })).id);
    await insertExistingChunk(published.id, published.revisionId);
    const inferenceFailure = fakeClient();
    inferenceFailure.embed.mockRejectedValueOnce(new Error("sidecar unavailable"));

    await expect(indexPublishedArticleRevision(published.id, published.revisionId, { client: inferenceFailure })).rejects.toThrow(
      "sidecar unavailable",
    );
    expect(getDb().prepare("select content from article_embedding_chunks").all()).toEqual([{ content: "old vector" }]);

    getDb().exec(`
      create trigger reject_new_embedding
      before insert on article_embedding_chunks
      when new.model_revision = 'fixed-revision'
      begin
        select raise(abort, 'embedding insert blocked');
      end
    `);
    await expect(indexPublishedArticleRevision(published.id, published.revisionId, { client: fakeClient() })).rejects.toThrow(
      "embedding insert blocked",
    );
    expect(getDb().prepare("select content from article_embedding_chunks").all()).toEqual([{ content: "old vector" }]);
  });

  it("removes vectors in the same transaction when an article is unpublished or deleted", async () => {
    const { createArticle, deleteArticle, publishArticle, unpublishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const first = publishArticle(createArticle(articleInput({ slug: "semantic-unpublish" })).id);
    const second = publishArticle(createArticle(articleInput({ slug: "semantic-delete" })).id);
    await insertExistingChunk(first.id, first.revisionId);
    await insertExistingChunk(second.id, second.revisionId);

    unpublishArticle(first.id);
    expect(getDb().prepare("select article_id from article_embedding_chunks order by article_id").all()).toEqual([{ article_id: second.id }]);

    expect(deleteArticle(second.id)).toBe(true);
    expect(getDb().prepare("select article_id from article_embedding_chunks").all()).toEqual([]);
  });

  it("backfills only missing current revisions and can safely requeue succeeded jobs", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const { enqueueSemanticSearchBackfill } = await import("@/lib/semantic/backfill");
    const indexed = publishArticle(createArticle(articleInput({ slug: "already-indexed" })).id);
    const missing = publishArticle(createArticle(articleInput({ slug: "missing-index" })).id);
    createArticle(articleInput({ slug: "draft-must-not-backfill" }));
    await insertExistingChunk(indexed.id, indexed.revisionId, embeddingIdentity.modelRevision);
    getDb()
      .prepare("update jobs set status = 'succeeded', attempts = 1 where type = 'search.embed'")
      .run();

    expect(
      enqueueSemanticSearchBackfill({
        identity: embeddingIdentity,
        now: new Date("2026-07-21T03:00:00.000Z"),
      }),
    ).toEqual({ published: 2, enqueued: 1, skippedIndexed: 1, alreadyPending: 0 });
    expect(
      getDb()
        .prepare("select status, attempts, last_error from jobs where type = 'search.embed' and dedupe_key = ?")
        .get(`article:${missing.id}:revision:${missing.revisionId}`),
    ).toEqual({ status: "queued", attempts: 0, last_error: null });
    expect(
      getDb()
        .prepare("select status from jobs where type = 'search.embed' and dedupe_key = ?")
        .get(`article:${indexed.id}:revision:${indexed.revisionId}`),
    ).toEqual({ status: "succeeded" });

    expect(
      enqueueSemanticSearchBackfill({
        identity: embeddingIdentity,
        force: true,
        now: new Date("2026-07-21T04:00:00.000Z"),
      }),
    ).toEqual({ published: 2, enqueued: 1, skippedIndexed: 0, alreadyPending: 1 });
    expect(
      getDb().prepare("select status, attempts from jobs where type = 'search.embed' order by dedupe_key").all(),
    ).toEqual([
      { status: "queued", attempts: 0 },
      { status: "queued", attempts: 0 },
    ]);
  });
});
