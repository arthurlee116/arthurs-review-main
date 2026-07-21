import { deleteMarkdownBody, readMarkdownBody, writeMarkdownBody } from "@/lib/content/markdown";
import { assertValidSlug } from "@/lib/content/slugs";
import type { CategoryId } from "@/lib/content/categories";
import { getDb } from "@/lib/db/connection";
import { setSetting } from "@/lib/services/settings";
import { deleteArticleFromFts, syncArticleToFts } from "./search";

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
  revisionId: number;
  draftRevisionId: number;
  publishedRevisionId: number | null;
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

export type ArticleRow = {
  id: number;
  revision_id: number;
  draft_revision_id: number;
  published_revision_id: number | null;
  title_zh: string;
  title_en: string | null;
  slug: string;
  category: CategoryId;
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

export class ArticleRevisionConflictError extends Error {
  readonly code = "ARTICLE_REVISION_CONFLICT";

  constructor() {
    super("This draft changed in another tab. Reload before saving again.");
    this.name = "ArticleRevisionConflictError";
  }
}

const selectArticleColumns = `
  articles.id,
  revisions.id as revision_id,
  articles.draft_revision_id,
  articles.published_revision_id,
  revisions.title_zh,
  revisions.title_en,
  revisions.slug,
  revisions.category,
  articles.published_at,
  articles.updated_at,
  revisions.excerpt_zh,
  revisions.excerpt_en,
  revisions.cover_image_path,
  articles.is_featured,
  revisions.seo_description,
  revisions.body_zh_path,
  revisions.body_en_path`;

function nowIso() {
  return new Date().toISOString();
}

function articleTags(revisionId: number) {
  return getDb()
    .prepare(
      `select tags.id, tags.name, tags.slug
       from tags
       join article_revision_tags on article_revision_tags.tag_id = tags.id
       where article_revision_tags.revision_id = ?
       order by tags.name`,
    )
    .all(revisionId) as Array<{ id: number; name: string; slug: string }>;
}

function articleTagsByRevisionId(revisionIds: number[]) {
  const tags = new Map<number, Article["tags"]>(revisionIds.map((id) => [id, []]));
  if (revisionIds.length === 0) return tags;

  const rows = getDb()
    .prepare(
      `select article_revision_tags.revision_id, tags.id, tags.name, tags.slug
       from tags
       join article_revision_tags on article_revision_tags.tag_id = tags.id
       where article_revision_tags.revision_id in (${revisionIds.map(() => "?").join(", ")})
       order by article_revision_tags.revision_id, tags.name`,
    )
    .all(...revisionIds) as Array<{ revision_id: number; id: number; name: string; slug: string }>;

  for (const row of rows) tags.get(row.revision_id)!.push({ id: row.id, name: row.name, slug: row.slug });
  return tags;
}

export function mapArticleRow(row: ArticleRow, tags = articleTags(row.revision_id)): Article {
  return {
    id: row.id,
    revisionId: row.revision_id,
    draftRevisionId: row.draft_revision_id,
    publishedRevisionId: row.published_revision_id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    slug: row.slug,
    category: row.category,
    status: row.published_revision_id === null ? "draft" : "published",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    excerptZh: row.excerpt_zh,
    excerptEn: row.excerpt_en,
    coverImagePath: row.cover_image_path,
    isFeatured: row.is_featured === 1,
    seoDescription: row.seo_description,
    bodyZhPath: row.body_zh_path,
    bodyEnPath: row.body_en_path,
    tags,
  };
}

export function mapArticleRows(rows: ArticleRow[]) {
  const tags = articleTagsByRevisionId(rows.map((row) => row.revision_id));
  return rows.map((row) => mapArticleRow(row, tags.get(row.revision_id)));
}

function withBodies(article: Article) {
  return {
    ...article,
    bodyZh: readMarkdownBody(article.bodyZhPath),
    bodyEn: article.bodyEnPath ? readMarkdownBody(article.bodyEnPath) : null,
  };
}

function insertRevision(
  articleId: number,
  input: ArticleInput,
  bodyZhPath: string,
  bodyEnPath: string | null,
  createdAt: string,
) {
  const db = getDb();
  const result = db
    .prepare(
      `insert into article_revisions(
         article_id, created_at, title_zh, title_en, slug, category, excerpt_zh, excerpt_en,
         cover_image_path, seo_description, body_zh_path, body_en_path
       ) values (
         @articleId, @createdAt, @titleZh, @titleEn, @slug, @category, @excerptZh, @excerptEn,
         @coverImagePath, @seoDescription, @bodyZhPath, @bodyEnPath
       )`,
    )
    .run({ ...input, articleId, createdAt, bodyZhPath, bodyEnPath });
  const revisionId = Number(result.lastInsertRowid);
  insertRevisionTags(revisionId, input.tagIds);
  return revisionId;
}

function insertRevisionTags(revisionId: number, tagIds: number[]) {
  const insert = getDb().prepare("insert into article_revision_tags(revision_id, tag_id) values (?, ?)");
  for (const tagId of [...new Set(tagIds)]) insert.run(revisionId, tagId);
}

export function createArticle(input: ArticleInput) {
  assertValidSlug(input.slug);
  const db = getDb();
  const timestamp = nowIso();
  const id = db.transaction(() => {
    const articleId = Number(db.prepare("insert into articles(updated_at) values (?)").run(timestamp).lastInsertRowid);
    const bodyZhPath = writeMarkdownBody(articleId, "zh", input.bodyZh);
    const bodyEnPath = input.bodyEn ? writeMarkdownBody(articleId, "en", input.bodyEn) : null;
    const revisionId = insertRevision(articleId, input, bodyZhPath, bodyEnPath, timestamp);
    db.prepare("update articles set draft_revision_id = ? where id = ?").run(revisionId, articleId);
    return articleId;
  }).immediate();
  return getArticleById(id, { includeDraft: true })!;
}

export function updateArticle(id: number, input: ArticleInput, expectedDraftRevisionId: number) {
  assertValidSlug(input.slug);
  if (!Number.isSafeInteger(expectedDraftRevisionId) || expectedDraftRevisionId <= 0) {
    throw new ArticleRevisionConflictError();
  }
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing) throw new Error("Article not found.");
  if (existing.draftRevisionId !== expectedDraftRevisionId) throw new ArticleRevisionConflictError();

  const bodyZhPath = writeMarkdownBody(id, "zh", input.bodyZh);
  const bodyEnPath = input.bodyEn ? writeMarkdownBody(id, "en", input.bodyEn) : null;
  const db = getDb();
  return db.transaction(() => {
    const current = db.prepare("select draft_revision_id from articles where id = ?").get(id) as { draft_revision_id: number } | undefined;
    if (!current) throw new Error("Article not found.");
    if (current.draft_revision_id !== expectedDraftRevisionId) throw new ArticleRevisionConflictError();

    const timestamp = nowIso();
    const revisionId = insertRevision(id, input, bodyZhPath, bodyEnPath, timestamp);
    const result = db
      .prepare("update articles set draft_revision_id = ?, updated_at = ? where id = ? and draft_revision_id = ?")
      .run(revisionId, timestamp, id, expectedDraftRevisionId);
    if (result.changes !== 1) throw new ArticleRevisionConflictError();
    return getArticleById(id, { includeDraft: true })!;
  }).immediate();
}

export function updateArticleEnglishFields(id: number, input: { titleEn: string; excerptEn: string; bodyEn: string }) {
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing?.bodyZh) throw new Error("Article not found.");
  return updateArticle(
    id,
    {
      titleZh: existing.titleZh,
      titleEn: input.titleEn,
      slug: existing.slug,
      category: existing.category,
      excerptZh: existing.excerptZh,
      excerptEn: input.excerptEn,
      seoDescription: existing.seoDescription,
      bodyZh: existing.bodyZh,
      bodyEn: input.bodyEn,
      tagIds: existing.tags.map((tag) => tag.id),
      coverImagePath: existing.coverImagePath,
    },
    existing.draftRevisionId,
  );
}

export function deleteArticle(id: number) {
  const article = getArticleById(id, { includeDraft: true });
  if (!article) return false;
  const db = getDb();
  const bodyPaths = db
    .prepare("select body_zh_path, body_en_path from article_revisions where article_id = ?")
    .all(id) as Array<{ body_zh_path: string; body_en_path: string | null }>;

  db.transaction(() => {
    deleteArticleFromFts(id);
    if (article.isFeatured) clearFeaturedArticleState(db);
    db.prepare("update articles set draft_revision_id = null, published_revision_id = null where id = ?").run(id);
    db.prepare("delete from articles where id = ?").run(id);
  }).immediate();

  for (const bodyPath of new Set(bodyPaths.flatMap((row) => [row.body_zh_path, row.body_en_path]).filter((value): value is string => Boolean(value)))) {
    try {
      deleteMarkdownBody(bodyPath);
    } catch (error) {
      console.error("Failed to remove deleted article Markdown body", error);
    }
  }
  return true;
}

export function getArticleById(id: number, options: { includeDraft: boolean }) {
  const pointer = options.includeDraft ? "draft_revision_id" : "published_revision_id";
  const row = getDb()
    .prepare(
      `select ${selectArticleColumns}
       from articles
       join article_revisions as revisions on revisions.id = articles.${pointer}
       where articles.id = ?`,
    )
    .get(id) as ArticleRow | undefined;
  return row ? withBodies(mapArticleRow(row)) : null;
}

export function getPublishedArticle(category: CategoryId, slug: string) {
  const row = getDb()
    .prepare(
      `select ${selectArticleColumns}
       from articles
       join article_revisions as revisions on revisions.id = articles.published_revision_id
       where revisions.category = ? and revisions.slug = ?`,
    )
    .get(category, slug) as ArticleRow | undefined;
  return row ? withBodies(mapArticleRow(row)) : null;
}

export function getArticleUrlRedirect(category: CategoryId, slug: string) {
  const row = getDb()
    .prepare(
      `select current_revision.category, current_revision.slug
       from article_url_history
       join articles on articles.id = article_url_history.article_id
       join article_revisions as current_revision on current_revision.id = articles.published_revision_id
       where article_url_history.category = ? and article_url_history.slug = ?`,
    )
    .get(category, slug) as { category: CategoryId; slug: string } | undefined;
  return row ?? null;
}

export type PublishedArticleListOptions = {
  featuredFirst?: boolean;
  limit?: number;
};

export function listPublishedArticles(category?: CategoryId, options: PublishedArticleListOptions = {}) {
  const where = category ? "where revisions.category = ?" : "";
  const order = options.featuredFirst
    ? "articles.is_featured desc, articles.published_at desc, articles.id desc"
    : "articles.published_at desc, articles.id desc";
  const limit = options.limit === undefined ? "" : " limit ?";
  const params: Array<string | number> = category ? [category] : [];
  if (options.limit !== undefined) params.push(options.limit);
  const rows = getDb()
    .prepare(
      `select ${selectArticleColumns}
       from articles
       join article_revisions as revisions on revisions.id = articles.published_revision_id
       ${where}
       order by ${order}${limit}`,
    )
    .all(...params) as ArticleRow[];
  return mapArticleRows(rows);
}

export function listStudioArticles() {
  const rows = getDb()
    .prepare(
      `select ${selectArticleColumns}
       from articles
       join article_revisions as revisions on revisions.id = articles.draft_revision_id
       order by articles.updated_at desc, articles.id desc`,
    )
    .all() as ArticleRow[];
  return mapArticleRows(rows);
}

export function listPublishedArticlesMissingEnglish() {
  const rows = getDb()
    .prepare(
      `select ${selectArticleColumns}
       from articles
       join article_revisions as revisions on revisions.id = articles.published_revision_id
       where revisions.title_en is null or revisions.title_en = ''
          or revisions.excerpt_en is null or revisions.excerpt_en = ''
          or revisions.body_en_path is null or revisions.body_en_path = ''
       order by articles.published_at desc, articles.id desc`,
    )
    .all() as ArticleRow[];
  return mapArticleRows(rows).map(withBodies);
}

export function publishArticle(id: number) {
  const article = getArticleById(id, { includeDraft: true });
  if (!article) throw new Error("Article not found.");
  if (!article.titleZh || !article.slug || !article.bodyZh) throw new Error("Required fields are missing.");
  const db = getDb();
  return db.transaction(() => {
    const previous = db
      .prepare(
        `select revisions.category, revisions.slug
         from articles
         join article_revisions as revisions on revisions.id = articles.published_revision_id
         where articles.id = ?`,
      )
      .get(id) as { category: CategoryId; slug: string } | undefined;
    const conflict = db
      .prepare(
        `select articles.id
         from articles
         join article_revisions as revisions on revisions.id = articles.published_revision_id
         where revisions.category = ? and revisions.slug = ? and articles.id <> ?`,
      )
      .get(article.category, article.slug, id);
    if (conflict) throw new Error("A published article already uses this category and slug.");

    const historicalConflict = db
      .prepare("select article_id from article_url_history where category = ? and slug = ? and article_id <> ?")
      .get(article.category, article.slug, id);
    if (historicalConflict) throw new Error("A historical article URL already uses this category and slug.");

    const timestamp = nowIso();
    if (previous && (previous.category !== article.category || previous.slug !== article.slug)) {
      const previousOwner = db
        .prepare("select article_id from article_url_history where category = ? and slug = ?")
        .get(previous.category, previous.slug) as { article_id: number } | undefined;
      if (previousOwner && previousOwner.article_id !== id) {
        throw new Error("A historical article URL already uses the previous category and slug.");
      }
      db.prepare(
        `insert into article_url_history(article_id, category, slug, created_at)
         values (?, ?, ?, ?)
         on conflict(category, slug) do nothing`,
      ).run(id, previous.category, previous.slug, timestamp);
    }
    db.prepare(
      `update articles
       set published_revision_id = draft_revision_id,
           published_at = coalesce(published_at, ?),
           updated_at = ?
       where id = ?`,
    ).run(timestamp, timestamp, id);
    const published = getArticleById(id, { includeDraft: true })!;
    syncArticleToFts(published);
    return published;
  }).immediate();
}

export function unpublishArticle(id: number) {
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing) throw new Error("Article not found.");
  const db = getDb();
  return db.transaction(() => {
    db.prepare("update articles set published_revision_id = null, updated_at = ? where id = ?").run(nowIso(), id);
    if (existing.isFeatured) clearFeaturedArticleState(db);
    deleteArticleFromFts(id);
    return getArticleById(id, { includeDraft: true });
  }).immediate();
}

export function setFeaturedArticle(id: number) {
  const db = getDb();
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing) throw new Error("Article not found.");
  if (existing.status !== "published") throw new Error("Featured article must be published.");
  return db.transaction(() => {
    db.prepare("update articles set is_featured = 0").run();
    db.prepare("update articles set is_featured = 1 where id = ?").run(id);
    setSetting("featuredArticleId", String(id));
    return getArticleById(id, { includeDraft: true })!;
  }).immediate();
}

export function clearFeaturedArticle() {
  const db = getDb();
  db.transaction(() => clearFeaturedArticleState(db)).immediate();
}

function clearFeaturedArticleState(db: ReturnType<typeof getDb>) {
  db.prepare("update articles set is_featured = 0").run();
  setSetting("featuredArticleId", "");
}
