import { getDb } from "@/lib/db/connection";
import { readMarkdownBody } from "@/lib/content/markdown";
import { mapArticleRow } from "./articles";
import type { Article, ArticleRow } from "./articles";

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

/** Full-text search across published articles using FTS5 with BM25 ranking. */
export function searchArticles(query: string): Article[] {
  const normalized = query.trim();
  if (!normalized) return [];

  const ftsQuery = buildFtsQuery(normalized);
  if (!ftsQuery) return [];

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.*
       FROM articles a
       JOIN article_search s ON a.id = s.rowid
       WHERE article_search MATCH ?
         AND a.status = 'published'
       ORDER BY rank
       LIMIT 50`,
    )
    .all(ftsQuery) as ArticleRow[];

  return rows.map(mapArticleRow);
}
