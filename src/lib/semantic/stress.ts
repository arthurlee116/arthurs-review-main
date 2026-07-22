import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db/connection";
import { getArticleById } from "@/lib/services/articles";
import { syncArticleToFts } from "@/lib/services/search";

export const SEMANTIC_STRESS_MARKER = ".semantic-benchmark-isolated";

type PublishedSource = {
  articleId: number;
  revisionId: number;
  publishedAt: string | null;
  updatedAt: string;
  titleZh: string;
  titleEn: string | null;
  slug: string;
  category: "commentary" | "society" | "misc";
  excerptZh: string;
  excerptEn: string | null;
  coverImagePath: string | null;
  seoDescription: string;
  bodyZhPath: string;
  bodyEnPath: string | null;
};

export function assertSemanticStressDirectory(dataDirectory: string, confirmed: boolean) {
  if (!confirmed) throw new Error("Semantic stress generation requires --confirm-isolated.");
  const marker = path.join(path.resolve(dataDirectory), SEMANTIC_STRESS_MARKER);
  if (!fs.statSync(marker, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Semantic stress generation requires the ${SEMANTIC_STRESS_MARKER} marker in DATA_DIR.`);
  }
}

export function clonePublishedArticlesForStress(targetArticleCount: number) {
  if (!Number.isInteger(targetArticleCount) || targetArticleCount < 1 || targetArticleCount > 5_000) {
    throw new Error("Semantic stress target must be an integer between 1 and 5000.");
  }

  const db = getDb();
  const existingStressCount = (
    db
      .prepare(
        `select count(*) as count
         from articles
         join article_revisions on article_revisions.id = articles.published_revision_id
         where article_revisions.slug like 'semantic-stress-%'`,
      )
      .get() as { count: number }
  ).count;
  if (existingStressCount > 0) throw new Error("Semantic stress generation requires a fresh isolated copy.");

  const sources = db
    .prepare(
      `select articles.id as articleId,
              revisions.id as revisionId,
              articles.published_at as publishedAt,
              articles.updated_at as updatedAt,
              revisions.title_zh as titleZh,
              revisions.title_en as titleEn,
              revisions.slug,
              revisions.category,
              revisions.excerpt_zh as excerptZh,
              revisions.excerpt_en as excerptEn,
              revisions.cover_image_path as coverImagePath,
              revisions.seo_description as seoDescription,
              revisions.body_zh_path as bodyZhPath,
              revisions.body_en_path as bodyEnPath
       from articles
       join article_revisions as revisions on revisions.id = articles.published_revision_id
       order by articles.id`,
    )
    .all() as PublishedSource[];
  if (sources.length === 0) throw new Error("Semantic stress generation needs at least one published source article.");
  if (sources.length > targetArticleCount) {
    throw new Error(`Semantic stress target ${targetArticleCount} is below the existing published count ${sources.length}.`);
  }

  const insertArticle = db.prepare(
    `insert into articles(published_at, updated_at, is_featured)
     values (?, ?, 0)`,
  );
  const insertRevision = db.prepare(
    `insert into article_revisions(
       article_id, created_at, title_zh, title_en, slug, category, excerpt_zh, excerpt_en,
       cover_image_path, seo_description, body_zh_path, body_en_path
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const sourceTagIds = db.prepare(
    `select tag_id as tagId
     from article_revision_tags
     where revision_id = ?
     order by tag_id`,
  );
  const insertTag = db.prepare("insert into article_revision_tags(revision_id, tag_id) values (?, ?)");
  const attachRevision = db.prepare(
    `update articles
     set draft_revision_id = ?, published_revision_id = ?
     where id = ?`,
  );

  const createdArticleIds = db.transaction(() => {
    const ids: number[] = [];
    for (let index = sources.length; index < targetArticleCount; index += 1) {
      const source = sources[(index - sources.length) % sources.length]!;
      const ordinal = index - sources.length + 1;
      const articleId = Number(insertArticle.run(source.publishedAt, source.updatedAt).lastInsertRowid);
      const revisionId = Number(
        insertRevision.run(
          articleId,
          source.updatedAt,
          `${source.titleZh}（压力副本 ${ordinal}）`,
          source.titleEn ? `${source.titleEn} (stress copy ${ordinal})` : null,
          `semantic-stress-${articleId}-${source.slug}`,
          source.category,
          source.excerptZh,
          source.excerptEn,
          source.coverImagePath,
          source.seoDescription,
          source.bodyZhPath,
          source.bodyEnPath,
        ).lastInsertRowid,
      );
      for (const { tagId } of sourceTagIds.all(source.revisionId) as Array<{ tagId: number }>) {
        insertTag.run(revisionId, tagId);
      }
      attachRevision.run(revisionId, revisionId, articleId);
      ids.push(articleId);
    }
    return ids;
  })();

  for (const articleId of createdArticleIds) {
    const article = getArticleById(articleId, { includeDraft: false });
    if (!article) throw new Error(`Failed to read generated stress article ${articleId}.`);
    syncArticleToFts(article);
  }

  return {
    sourceArticleCount: sources.length,
    createdArticleCount: createdArticleIds.length,
    totalArticleCount: sources.length + createdArticleIds.length,
  };
}
