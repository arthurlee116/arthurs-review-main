import type { SemanticSearchClient } from "./client";
import { createSemanticSearchClient } from "./client";
import { buildArticleEmbeddingChunks } from "./chunking";
import { encodeFloat32Vector } from "./vector";
import { deleteArticleEmbeddings } from "./storage";
import { categoryLabel } from "@/lib/content/categories";
import { getDb } from "@/lib/db/connection";
import { getArticleRevisionById } from "@/lib/services/articles";

type EmbeddingClient = Pick<SemanticSearchClient, "config" | "embed">;

type IndexingOptions = {
  client?: EmbeddingClient | null;
  batchSize?: number;
  now?: () => Date;
};

function isCurrentPublishedRevision(articleId: number, revisionId: number) {
  const row = getDb().prepare("select published_revision_id from articles where id = ?").get(articleId) as
    | { published_revision_id: number | null }
    | undefined;
  return row?.published_revision_id === revisionId;
}

export async function indexPublishedArticleRevision(articleId: number, revisionId: number, options: IndexingOptions = {}) {
  if (!Number.isInteger(articleId) || articleId <= 0 || !Number.isInteger(revisionId) || revisionId <= 0) {
    throw new Error("Article and revision ids must be positive integers.");
  }
  const batchSize = options.batchSize ?? 4;
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 32) {
    throw new Error("Embedding batch size must be an integer between 1 and 32.");
  }

  const client = options.client === undefined ? createSemanticSearchClient() : options.client;
  if (!client) return { status: "disabled" as const, articleId, revisionId };
  if (!isCurrentPublishedRevision(articleId, revisionId)) return { status: "stale" as const, articleId, revisionId };

  const article = getArticleRevisionById(articleId, revisionId);
  if (!article || article.publishedRevisionId !== revisionId) return { status: "stale" as const, articleId, revisionId };
  const chunks = buildArticleEmbeddingChunks({
    titleZh: article.titleZh,
    excerptZh: article.excerptZh,
    category: categoryLabel(article.category),
    tags: article.tags.map((tag) => tag.name),
    bodyZh: article.bodyZh ?? "",
  });

  const vectors: Float32Array[] = [];
  const tokenCounts: number[] = [];
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const response = await client.embed(
      "document",
      batch.map((chunk) => chunk.embeddingText),
    );
    vectors.push(...response.vectors);
    tokenCounts.push(...response.tokenCounts);
  }
  if (vectors.length !== chunks.length || tokenCounts.length !== chunks.length) {
    throw new Error("Semantic embedding client returned an incomplete article batch.");
  }

  const db = getDb();
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const identity = client.config.embedding;
  const result = db.transaction(() => {
    const pointer = db.prepare("select published_revision_id from articles where id = ?").get(articleId) as
      | { published_revision_id: number | null }
      | undefined;
    if (pointer?.published_revision_id !== revisionId) return { status: "stale" as const, articleId, revisionId };

    deleteArticleEmbeddings(articleId, db);
    const insert = db.prepare(
      `insert into article_embedding_chunks(
         article_id, revision_id, model_id, model_revision, dimension, chunk_index,
         language, content, token_count, embedding, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    chunks.forEach((chunk, index) => {
      insert.run(
        articleId,
        revisionId,
        identity.modelId,
        identity.modelRevision,
        identity.dimension,
        chunk.chunkIndex,
        chunk.language,
        chunk.content,
        tokenCounts[index],
        encodeFloat32Vector(vectors[index]!),
        timestamp,
      );
    });
    return { status: "indexed" as const, articleId, revisionId, chunkCount: chunks.length };
  }).immediate();
  return result;
}
