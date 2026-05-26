import { getDb } from "@/lib/db/connection";
import { readMarkdownBody } from "@/lib/content/markdown";
import { mapArticleRow } from "./articles";
import type { Article, ArticleRow } from "./articles";

export const SEARCH_PAGE_SIZE = 10;

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

type SearchArticleRow = ArticleRow & {
  snippet: string | null;
};

type CountRow = {
  total: number;
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
function buildFtsQuery(raw: string): string {
  const cjkReady = tokenizeForFts(raw);
  return cjkReady
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const escaped = t.replace(/[*"()\[\]{}^~|]/g, "");
      if (!escaped) return "";
      return `"${escaped}"*`;
    })
    .filter(Boolean)
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
  const normalized = query.trim();
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
         AND a.status = 'published'`,
    )
    .get(ftsQuery) as CountRow;

  if (total === 0) return emptySearchPage(normalized, pageSize);

  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(normalizedPage(options.page), totalPages);
  const offset = (page - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT a.*,
              snippet(article_search, -1, '${highlightStart}', '${highlightEnd}', '...', 24) as snippet
       FROM articles a
       JOIN article_search s ON a.id = s.rowid
       WHERE article_search MATCH ?
         AND a.status = 'published'
       ORDER BY rank, coalesce(a.published_at, a.updated_at) DESC, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(ftsQuery, pageSize, offset) as SearchArticleRow[];

  return {
    query: normalized,
    page,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    results: rows.map((row) => ({
      article: mapArticleRow(row),
      excerptParts: splitHighlightParts(row.snippet || row.excerpt_zh),
    })),
  };
}

/** Full-text search across published articles using FTS5 with BM25 ranking. */
export function searchArticles(query: string): Article[] {
  return searchArticleResults(query, { page: 1, pageSize: 50 }).results.map((result) => result.article);
}
