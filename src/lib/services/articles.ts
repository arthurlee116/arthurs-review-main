import { readMarkdownBody, writeMarkdownBody, deleteMarkdownBody } from "@/lib/content/markdown";
import { assertValidSlug } from "@/lib/content/slugs";
import type { CategoryId } from "@/lib/content/categories";
import { getDb } from "@/lib/db/connection";

export type ArticleStatus = "draft" | "published";

export type ArticleInput = {
  titleZh: string;
  titleEn: string | null;
  slug: string;
  category: CategoryId;
  excerptZh: string;
  excerptEn: string | null;
  seoDescription: string;
  bodyZh: string;
  bodyEn: string | null;
  tagIds: number[];
  coverImagePath: string | null;
};

export type Article = {
  id: number;
  titleZh: string;
  titleEn: string | null;
  slug: string;
  category: CategoryId;
  status: ArticleStatus;
  publishedAt: string | null;
  updatedAt: string;
  excerptZh: string;
  excerptEn: string | null;
  coverImagePath: string | null;
  isFeatured: boolean;
  seoDescription: string;
  bodyZhPath: string;
  bodyEnPath: string | null;
  tags: Array<{ id: number; name: string; slug: string }>;
  bodyZh?: string;
  bodyEn?: string | null;
};

type ArticleRow = {
  id: number;
  title_zh: string;
  title_en: string | null;
  slug: string;
  category: CategoryId;
  status: ArticleStatus;
  published_at: string | null;
  updated_at: string;
  excerpt_zh: string;
  excerpt_en: string | null;
  cover_image_path: string | null;
  is_featured: number;
  seo_description: string;
  body_zh_path: string;
  body_en_path: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function articleTags(articleId: number) {
  return getDb()
    .prepare(
      `select tags.id, tags.name, tags.slug
       from tags
       join article_tags on article_tags.tag_id = tags.id
       where article_tags.article_id = ?
       order by tags.name`,
    )
    .all(articleId) as Array<{ id: number; name: string; slug: string }>;
}

function mapArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    slug: row.slug,
    category: row.category,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    excerptZh: row.excerpt_zh,
    excerptEn: row.excerpt_en,
    coverImagePath: row.cover_image_path,
    isFeatured: row.is_featured === 1,
    seoDescription: row.seo_description,
    bodyZhPath: row.body_zh_path,
    bodyEnPath: row.body_en_path,
    tags: articleTags(row.id),
  };
}

function withBodies(article: Article) {
  return {
    ...article,
    bodyZh: readMarkdownBody(article.bodyZhPath),
    bodyEn: article.bodyEnPath ? readMarkdownBody(article.bodyEnPath) : null,
  };
}

export function createArticle(input: ArticleInput) {
  assertValidSlug(input.slug);
  const db = getDb();
  const timestamp = nowIso();
  const result = db
    .prepare(
      `insert into articles
      (title_zh, title_en, slug, category, updated_at, excerpt_zh, excerpt_en, cover_image_path, seo_description, body_zh_path, body_en_path)
      values (@titleZh, @titleEn, @slug, @category, @updatedAt, @excerptZh, @excerptEn, @coverImagePath, @seoDescription, '', null)`,
    )
    .run({ ...input, updatedAt: timestamp });

  const id = Number(result.lastInsertRowid);
  const bodyZhPath = writeMarkdownBody(id, "zh", input.bodyZh);
  const bodyEnPath = input.bodyEn ? writeMarkdownBody(id, "en", input.bodyEn) : null;
  db.prepare("update articles set body_zh_path = ?, body_en_path = ? where id = ?").run(bodyZhPath, bodyEnPath, id);
  replaceArticleTags(id, input.tagIds);
  return getArticleById(id, { includeDraft: true })!;
}

export function updateArticle(id: number, input: ArticleInput) {
  assertValidSlug(input.slug);
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing) throw new Error("Article not found.");
  const bodyZhPath = writeMarkdownBody(id, "zh", input.bodyZh);
  const bodyEnPath = input.bodyEn ? writeMarkdownBody(id, "en", input.bodyEn) : null;
  if (!bodyEnPath) deleteMarkdownBody(existing.bodyEnPath);

  getDb()
    .prepare(
      `update articles set title_zh = @titleZh, title_en = @titleEn, slug = @slug, category = @category,
      updated_at = @updatedAt, excerpt_zh = @excerptZh, excerpt_en = @excerptEn, cover_image_path = @coverImagePath,
      seo_description = @seoDescription, body_zh_path = @bodyZhPath, body_en_path = @bodyEnPath where id = @id`,
    )
    .run({ ...input, id, updatedAt: nowIso(), bodyZhPath, bodyEnPath });
  replaceArticleTags(id, input.tagIds);
  return getArticleById(id, { includeDraft: true })!;
}

export function deleteArticle(id: number) {
  const article = getArticleById(id, { includeDraft: true });
  if (!article) return false;
  deleteMarkdownBody(article.bodyZhPath);
  deleteMarkdownBody(article.bodyEnPath);
  getDb().prepare("delete from articles where id = ?").run(id);
  return true;
}

export function getArticleById(id: number, options: { includeDraft: boolean }) {
  const row = getDb().prepare("select * from articles where id = ?").get(id) as ArticleRow | undefined;
  if (!row) return null;
  const article = mapArticle(row);
  if (article.status === "draft" && !options.includeDraft) return null;
  return withBodies(article);
}

export function getPublishedArticle(category: CategoryId, slug: string) {
  const row = getDb()
    .prepare("select * from articles where category = ? and slug = ? and status = ?")
    .get(category, slug, "published") as ArticleRow | undefined;
  return row ? withBodies(mapArticle(row)) : null;
}

export function listPublishedArticles(category?: CategoryId) {
  const rows = category
    ? (getDb()
        .prepare("select * from articles where status = ? and category = ? order by published_at desc, id desc")
        .all("published", category) as ArticleRow[])
    : (getDb().prepare("select * from articles where status = ? order by published_at desc, id desc").all("published") as ArticleRow[]);
  return rows.map(mapArticle);
}

export function listStudioArticles() {
  return (getDb().prepare("select * from articles order by updated_at desc, id desc").all() as ArticleRow[]).map(mapArticle);
}

export function publishArticle(id: number) {
  const article = getArticleById(id, { includeDraft: true });
  if (!article) throw new Error("Article not found.");
  if (!article.titleZh || !article.slug || !article.bodyZh) throw new Error("Required fields are missing.");
  const timestamp = nowIso();
  getDb()
    .prepare("update articles set status = 'published', published_at = coalesce(published_at, ?), updated_at = ? where id = ?")
    .run(timestamp, timestamp, id);
  return getArticleById(id, { includeDraft: true })!;
}

export function unpublishArticle(id: number) {
  getDb().prepare("update articles set status = 'draft', updated_at = ? where id = ?").run(nowIso(), id);
  return getArticleById(id, { includeDraft: true });
}

export function setFeaturedArticle(id: number) {
  const db = getDb();
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing) throw new Error("Article not found.");
  const tx = db.transaction(() => {
    db.prepare("update articles set is_featured = 0").run();
    db.prepare("update articles set is_featured = 1 where id = ?").run(id);
  });
  tx();
}

function replaceArticleTags(articleId: number, tagIds: number[]) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("delete from article_tags where article_id = ?").run(articleId);
    const stmt = db.prepare("insert into article_tags (article_id, tag_id) values (?, ?)");
    for (const tagId of [...new Set(tagIds)]) stmt.run(articleId, tagId);
  });
  tx();
}
