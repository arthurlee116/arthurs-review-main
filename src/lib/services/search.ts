import { getDb } from "@/lib/db/connection";
import { readMarkdownBody } from "@/lib/content/markdown";
import { MAX_SEARCH_CODE_POINTS, MAX_SEARCH_TOKENS } from "@/lib/search-limits";
import {
  createSemanticSearchClient,
  SemanticServiceError,
  type SemanticSearchClient,
} from "@/lib/semantic/client";
import { applyRerankerScores, reciprocalRankFusion } from "@/lib/semantic/ranking";
import { rankDenseArticleChunks, type StoredEmbeddingChunk } from "@/lib/semantic/vector";
import { mapArticleRows } from "./articles";
import type { Article, ArticleRow } from "./articles";

export const SEARCH_PAGE_SIZE = 10;
export { MAX_SEARCH_CODE_POINTS, MAX_SEARCH_TOKENS };

const highlightStart = "[[[mark]]]";
const highlightEnd = "[[[/mark]]]";

export type SearchHighlightPart = {
  text: string;
  highlighted: boolean;
};

export type SearchArticleResult = {
  article: Article;
  excerptParts: SearchHighlightPart[];
};

export type SearchArticleResultsPage = {
  query: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  results: SearchArticleResult[];
};

export type HybridSearchTrace = {
  fts: Array<{ articleId: number; rank: number; score: number }>;
  dense: Array<{ articleId: number; rank: number; cosineScore: number; chunkIndex: number }>;
  final: Array<{
    articleId: number;
    rank: number;
    rrfScore: number;
    ftsRank: number | null;
    denseRank: number | null;
    rerankerScore: number | null;
  }>;
};

type SearchArticleRow = ArticleRow & {
  snippet: string | null;
};

type CountRow = {
  total: number;
};

type HybridSemanticClient = Pick<SemanticSearchClient, "config" | "embed" | "rerank">;

type FtsArticleCandidate = {
  articleId: number;
  publishedAt: string | null;
  score: number;
  article: Article;
  excerptParts: SearchHighlightPart[];
};

type DenseChunkRow = {
  article_id: number;
  model_id: string;
  model_revision: string;
  dimension: number;
  chunk_index: number;
  language: StoredEmbeddingChunk["language"];
  content: string;
  embedding: Buffer;
  published_at: string | null;
};

// Insert spaces between consecutive CJK characters so the unicode61 tokenizer
// treats each as a separate token (unicode61 groups contiguous CJK into one token).
function tokenizeForFts(text: string): string {
  return text
    .replace(/([\p{Script=Han}])/gu, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

// Escape FTS5 special characters and build a prefix-match query.
// The input is pre-tokenized for CJK so whitespace-splitting yields individual
// characters or words, each with a trailing * for prefix matching.
export function normalizeSearchQuery(raw: string) {
  return Array.from(raw.trim()).slice(0, MAX_SEARCH_CODE_POINTS).join("");
}

export function buildFtsQuery(raw: string): string {
  const cjkReady = tokenizeForFts(normalizeSearchQuery(raw));
  return cjkReady
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const escaped = t.replace(/[*"()\[\]{}^~|]/g, "");
      if (!escaped || !/[\p{L}\p{N}]/u.test(escaped)) return "";
      return `"${escaped}"*`;
    })
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS)
    .join(" ");
}

/** Insert or update an article's full text into the FTS5 index. */
export function syncArticleToFts(article: Article): void {
  const db = getDb();
  const bodyZh = readMarkdownBody(article.bodyZhPath);
  const bodyEn = article.bodyEnPath ? readMarkdownBody(article.bodyEnPath) : "";
  const tags = article.tags.map((t) => t.name).join(" ");

  db.prepare(
    `INSERT OR REPLACE INTO article_search(rowid, title_zh, title_en, excerpt_zh, excerpt_en, body_zh, body_en, category, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    article.id,
    tokenizeForFts(article.titleZh),
    article.titleEn ?? "",
    tokenizeForFts(article.excerptZh),
    article.excerptEn ?? "",
    tokenizeForFts(bodyZh),
    bodyEn,
    tokenizeForFts(article.category),
    tokenizeForFts(tags),
  );
}

/** Remove an article from the FTS5 index. */
export function deleteArticleFromFts(id: number): void {
  getDb().prepare("DELETE FROM article_search WHERE rowid = ?").run(id);
}

function emptySearchPage(query: string, pageSize: number): SearchArticleResultsPage {
  return {
    query,
    page: 1,
    pageSize,
    total: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
    results: [],
  };
}

function normalizedPage(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function isHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function normalizeCjkTokenSpacing(text: string) {
  return text.replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1");
}

function appendHighlightPart(parts: SearchHighlightPart[], part: SearchHighlightPart) {
  const normalizedText = normalizeCjkTokenSpacing(part.text);
  if (!normalizedText) return;

  const previous = parts.at(-1);
  if (previous) {
    const previousLast = previous.text.at(-1);
    const currentFirst = normalizedText.at(0);
    if (previousLast && currentFirst && isHan(previousLast) && isHan(currentFirst)) {
      previous.text = previous.text.trimEnd();
    }
  }

  if (previous?.highlighted === part.highlighted) {
    previous.text += normalizedText;
    return;
  }

  parts.push({ text: normalizedText, highlighted: part.highlighted });
}

function normalizeHighlightParts(rawParts: SearchHighlightPart[]) {
  const parts: SearchHighlightPart[] = [];

  for (let index = 0; index < rawParts.length; index += 1) {
    const part = rawParts[index];
    const previous = parts.at(-1);
    const next = rawParts[index + 1];

    if (
      part.text.trim() === "" &&
      previous &&
      next &&
      previous.highlighted === next.highlighted &&
      isHan(previous.text.at(-1) ?? "") &&
      isHan(next.text.trimStart().at(0) ?? "")
    ) {
      continue;
    }

    appendHighlightPart(parts, part);
  }

  return parts;
}

export function splitHighlightParts(snippet: string): SearchHighlightPart[] {
  const parts: SearchHighlightPart[] = [];
  let cursor = 0;

  while (cursor < snippet.length) {
    const start = snippet.indexOf(highlightStart, cursor);
    if (start === -1) {
      parts.push({ text: snippet.slice(cursor), highlighted: false });
      break;
    }

    if (start > cursor) {
      parts.push({ text: snippet.slice(cursor, start), highlighted: false });
    }

    const textStart = start + highlightStart.length;
    const end = snippet.indexOf(highlightEnd, textStart);
    if (end === -1) {
      parts.push({ text: snippet.slice(start), highlighted: false });
      break;
    }

    parts.push({ text: snippet.slice(textStart, end), highlighted: true });
    cursor = end + highlightEnd.length;
  }

  return normalizeHighlightParts(parts);
}

export function searchArticleResults(query: string, options: { page?: number; pageSize?: number } = {}): SearchArticleResultsPage {
  const normalized = normalizeSearchQuery(query);
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? SEARCH_PAGE_SIZE));
  if (!normalized) return emptySearchPage(normalized, pageSize);

  const ftsQuery = buildFtsQuery(normalized);
  if (!ftsQuery) return emptySearchPage(normalized, pageSize);

  const db = getDb();
  const { total } = db
    .prepare(
      `SELECT count(*) as total
       FROM articles a
       JOIN article_search s ON a.id = s.rowid
       WHERE article_search MATCH ?
         AND a.published_revision_id IS NOT NULL`,
    )
    .get(ftsQuery) as CountRow;

  if (total === 0) return emptySearchPage(normalized, pageSize);

  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(normalizedPage(options.page), totalPages);
  const offset = (page - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT a.id,
              r.id as revision_id,
              a.draft_revision_id,
              a.published_revision_id,
              r.title_zh,
              r.title_en,
              r.slug,
              r.category,
              a.published_at,
              a.updated_at,
              r.excerpt_zh,
              r.excerpt_en,
              r.cover_image_path,
              a.is_featured,
              r.seo_description,
              r.body_zh_path,
              r.body_en_path,
              snippet(article_search, -1, '${highlightStart}', '${highlightEnd}', '...', 24) as snippet
       FROM articles a
       JOIN article_revisions r ON r.id = a.published_revision_id
       JOIN article_search s ON a.id = s.rowid
       WHERE article_search MATCH ?
       ORDER BY rank, coalesce(a.published_at, a.updated_at) DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(ftsQuery, pageSize, offset) as SearchArticleRow[];

  const articles = mapArticleRows(rows);
  return {
    query: normalized,
    page,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    results: rows.map((row, index) => ({
      article: articles[index]!,
      excerptParts: splitHighlightParts(row.snippet || row.excerpt_zh),
    })),
  };
}

/** Full-text search across published articles using FTS5 with BM25 ranking. */
export function searchArticles(query: string): Article[] {
  return searchArticleResults(query, { page: 1, pageSize: 50 }).results.map((result) => result.article);
}

function searchFtsCandidates(ftsQuery: string, limit: number): FtsArticleCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id,
              r.id as revision_id,
              a.draft_revision_id,
              a.published_revision_id,
              r.title_zh,
              r.title_en,
              r.slug,
              r.category,
              a.published_at,
              a.updated_at,
              r.excerpt_zh,
              r.excerpt_en,
              r.cover_image_path,
              a.is_featured,
              r.seo_description,
              r.body_zh_path,
              r.body_en_path,
              bm25(article_search) as fts_score,
              snippet(article_search, -1, '${highlightStart}', '${highlightEnd}', '...', 24) as snippet
       FROM articles a
       JOIN article_revisions r ON r.id = a.published_revision_id
       JOIN article_search s ON a.id = s.rowid
       WHERE article_search MATCH ?
       ORDER BY rank, coalesce(a.published_at, a.updated_at) DESC, a.id DESC
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as Array<SearchArticleRow & { fts_score: number }>;
  const articles = mapArticleRows(rows);
  return rows.map((row, index) => ({
    articleId: row.id,
    publishedAt: row.published_at ?? row.updated_at,
    score: row.fts_score,
    article: articles[index]!,
    excerptParts: splitHighlightParts(row.snippet || row.excerpt_zh),
  }));
}

function loadDenseRows(client: HybridSemanticClient): StoredEmbeddingChunk[] {
  const identity = client.config.embedding;
  const rows = getDb()
    .prepare(
      `select chunks.article_id,
              chunks.model_id,
              chunks.model_revision,
              chunks.dimension,
              chunks.chunk_index,
              chunks.language,
              chunks.content,
              chunks.embedding,
              coalesce(articles.published_at, articles.updated_at) as published_at
       from article_embedding_chunks as chunks
       join articles on articles.id = chunks.article_id
                    and articles.published_revision_id = chunks.revision_id
       where chunks.model_id = ?
         and chunks.model_revision = ?
         and chunks.dimension = ?
       order by chunks.article_id, chunks.chunk_index`,
    )
    .all(identity.modelId, identity.modelRevision, identity.dimension) as DenseChunkRow[];
  return rows.map((row) => ({
    articleId: row.article_id,
    modelId: row.model_id,
    modelRevision: row.model_revision,
    dimension: row.dimension,
    chunkIndex: row.chunk_index,
    language: row.language,
    content: row.content,
    embedding: row.embedding,
    publishedAt: row.published_at,
  }));
}

function loadPublishedArticlesById(ids: readonly number[]) {
  if (ids.length === 0) return new Map<number, Article>();
  const rows = getDb()
    .prepare(
      `select a.id,
              r.id as revision_id,
              a.draft_revision_id,
              a.published_revision_id,
              r.title_zh,
              r.title_en,
              r.slug,
              r.category,
              a.published_at,
              a.updated_at,
              r.excerpt_zh,
              r.excerpt_en,
              r.cover_image_path,
              a.is_featured,
              r.seo_description,
              r.body_zh_path,
              r.body_en_path
       from articles as a
       join article_revisions as r on r.id = a.published_revision_id
       where a.id in (${ids.map(() => "?").join(", ")})`,
    )
    .all(...ids) as ArticleRow[];
  return new Map(mapArticleRows(rows).map((article) => [article.id, article]));
}

function semanticExcerpt(content: string) {
  const points = Array.from(content.trim());
  const limited = points.slice(0, 220).join("");
  return points.length > 220 ? `${limited}…` : limited;
}

function fallbackLog(stage: "embed" | "dense" | "rerank", error?: unknown) {
  console.warn("Semantic search fallback", {
    stage,
    reason: error instanceof SemanticServiceError ? error.reason : error instanceof Error ? error.name : error ? "unknown" : "unavailable",
  });
}

export async function searchArticleResultsHybrid(
  query: string,
  options: {
    page?: number;
    pageSize?: number;
    client?: HybridSemanticClient | null;
    rerankEnabled?: boolean;
    onTrace?: (trace: HybridSearchTrace) => void;
  } = {},
): Promise<SearchArticleResultsPage> {
  const normalized = normalizeSearchQuery(query);
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? SEARCH_PAGE_SIZE));
  if (!normalized) return emptySearchPage(normalized, pageSize);
  const ftsQuery = buildFtsQuery(normalized);
  if (!ftsQuery) return emptySearchPage(normalized, pageSize);

  const client = options.client === undefined ? createSemanticSearchClient() : options.client;
  if (!client) return searchArticleResults(normalized, options);
  const denseRows = loadDenseRows(client);
  if (denseRows.length === 0) return searchArticleResults(normalized, options);

  let queryVector: Float32Array;
  try {
    const embedded = await client.embed("query", [normalized]);
    queryVector = embedded.vectors[0]!;
  } catch (error) {
    fallbackLog("embed", error);
    return searchArticleResults(normalized, options);
  }

  const ftsCandidates = searchFtsCandidates(ftsQuery, 30);
  const densePublishedAt = new Map(denseRows.map((row) => [row.articleId, row.publishedAt]));
  const denseRanking = rankDenseArticleChunks(denseRows, queryVector, client.config.embedding, 30);
  if (denseRanking.candidates.length === 0) {
    fallbackLog("dense");
    return searchArticleResults(normalized, options);
  }
  if (denseRanking.skippedRows > 0) {
    console.warn("Semantic search skipped vector rows", { count: denseRanking.skippedRows });
  }
  const denseCandidates = denseRanking.candidates.map((candidate) => ({
    ...candidate,
    publishedAt: densePublishedAt.get(candidate.articleId) ?? null,
  }));
  let fused = reciprocalRankFusion(ftsCandidates, denseCandidates, 60);
  const articles = loadPublishedArticlesById(fused.map((candidate) => candidate.articleId));
  fused = fused.filter((candidate) => articles.has(candidate.articleId));

  const rerankEnabled = options.rerankEnabled ?? process.env.SEMANTIC_RERANK_ENABLED === "1";
  if (rerankEnabled && fused.length > 0) {
    const head = fused.slice(0, 10);
    try {
      const rerankScores = await client.rerank(
        normalized,
        head.map((candidate) => {
          const article = articles.get(candidate.articleId)!;
          const passageParts = [
            article.titleZh,
            article.titleEn ?? "",
            article.excerptZh,
            article.excerptEn ?? "",
            candidate.dense?.content ?? "",
            candidate.fts?.excerptParts.map((part) => part.text).join("") ?? "",
          ].filter(Boolean);
          return { id: `article:${candidate.articleId}`, text: [...new Set(passageParts)].join("\n") };
        }),
      );
      const byArticleId = new Map(
        rerankScores.map((score) => [Number(score.id.replace(/^article:/, "")), score.score]),
      );
      fused = applyRerankerScores(fused, byArticleId, 10);
    } catch (error) {
      fallbackLog("rerank", error);
    }
  }

  options.onTrace?.({
    fts: ftsCandidates.map((candidate, index) => ({
      articleId: candidate.articleId,
      rank: index + 1,
      score: candidate.score,
    })),
    dense: denseCandidates.map((candidate, index) => ({
      articleId: candidate.articleId,
      rank: index + 1,
      cosineScore: candidate.score,
      chunkIndex: candidate.chunkIndex,
    })),
    final: fused.map((candidate, index) => ({
      articleId: candidate.articleId,
      rank: index + 1,
      rrfScore: candidate.score,
      ftsRank: candidate.ftsRank,
      denseRank: candidate.denseRank,
      rerankerScore:
        "rerankerScore" in candidate && typeof candidate.rerankerScore === "number" ? candidate.rerankerScore : null,
    })),
  });

  const total = fused.length;
  if (total === 0) return emptySearchPage(normalized, pageSize);
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(normalizedPage(options.page), totalPages);
  const pageCandidates = fused.slice((page - 1) * pageSize, page * pageSize);
  return {
    query: normalized,
    page,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    results: pageCandidates.map((candidate) => {
      const article = articles.get(candidate.articleId)!;
      return {
        article,
        excerptParts: candidate.fts?.excerptParts ?? [
          { text: semanticExcerpt(candidate.dense?.content ?? article.excerptZh), highlighted: false },
        ],
      };
    }),
  };
}
