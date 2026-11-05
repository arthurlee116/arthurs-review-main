import { z } from "zod";
import type { CategoryId } from "@/lib/content/categories";
import { getDb } from "@/lib/db/connection";
import { NotFoundError } from "@/lib/errors";
import { publicArticleCommentsTag } from "@/lib/services/public-cache-tags";

export const COMMENT_BODY_MAX = 4000;
export const COMMENT_NAME_MAX = 40;
export const COMMENT_EMAIL_MAX = 200;

export const commentStatuses = ["pending", "approved", "rejected"] as const;
export type CommentStatus = (typeof commentStatuses)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

export const CommentInputSchema = z.object({
  articleId: z.number().int().positive(),
  authorName: optionalText(COMMENT_NAME_MAX),
  email: optionalText(COMMENT_EMAIL_MAX).pipe(z.email().nullable()),
  body: z.string().trim().min(1, "Comment cannot be empty").max(COMMENT_BODY_MAX),
  locale: z.enum(["zh", "en"]),
});

export type CommentInput = z.input<typeof CommentInputSchema>;

export type PublicComment = {
  id: number;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type StudioComment = PublicComment & {
  articleId: number;
  email: string | null;
  locale: "zh" | "en";
  status: CommentStatus;
  reviewedAt: string | null;
  articleTitle: string;
  articleCategory: CategoryId | null;
  articleSlug: string | null;
};

type StudioCommentRow = {
  id: number;
  article_id: number;
  author_name: string | null;
  email: string | null;
  body: string;
  locale: "zh" | "en";
  status: CommentStatus;
  created_at: string;
  reviewed_at: string | null;
  title_zh: string;
  category: CategoryId | null;
  slug: string | null;
};

/** Returns the public location of a published article, or null when it is not published. */
function publishedArticleLocation(articleId: number) {
  return (
    (getDb()
      .prepare(
        `select revisions.category, revisions.slug
         from articles
         join article_revisions as revisions on revisions.id = articles.published_revision_id
         where articles.id = ?`,
      )
      .get(articleId) as { category: CategoryId; slug: string } | undefined) ?? null
  );
}

export function createComment(input: CommentInput, now = new Date()) {
  const parsed = CommentInputSchema.parse(input);
  if (!publishedArticleLocation(parsed.articleId)) throw new NotFoundError("Article not found.");
  const result = getDb()
    .prepare(
      `insert into comments (article_id, author_name, email, body, locale, status, created_at)
       values (?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(parsed.articleId, parsed.authorName, parsed.email, parsed.body, parsed.locale, now.toISOString());
  return { id: Number(result.lastInsertRowid), status: "pending" as const };
}

export function listApprovedComments(articleId: number): PublicComment[] {
  const rows = getDb()
    .prepare(
      `select id, author_name, body, created_at
       from comments
       where article_id = ? and status = 'approved'
       order by created_at asc, id asc`,
    )
    .all(articleId) as Array<{ id: number; author_name: string | null; body: string; created_at: string }>;
  return rows.map((row) => ({ id: row.id, authorName: row.author_name, body: row.body, createdAt: row.created_at }));
}

export function listStudioComments(status: CommentStatus, limit = 200): StudioComment[] {
  const rows = getDb()
    .prepare(
      `select comments.*, draft.title_zh, revisions.category, revisions.slug
       from comments
       join articles on articles.id = comments.article_id
       join article_revisions as draft on draft.id = articles.draft_revision_id
       left join article_revisions as revisions on revisions.id = articles.published_revision_id
       where comments.status = ?
       order by comments.created_at ${status === "pending" ? "asc" : "desc"}, comments.id
       limit ?`,
    )
    .all(status, limit) as StudioCommentRow[];
  return rows.map((row) => ({
    id: row.id,
    articleId: row.article_id,
    authorName: row.author_name,
    email: row.email,
    body: row.body,
    locale: row.locale,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    articleTitle: row.title_zh,
    articleCategory: row.category,
    articleSlug: row.slug,
  }));
}

export function countCommentsByStatus(): Record<CommentStatus, number> {
  const rows = getDb().prepare("select status, count(*) as count from comments group by status").all() as Array<{
    status: CommentStatus;
    count: number;
  }>;
  const counts: Record<CommentStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

function commentArticleId(id: number) {
  const row = getDb().prepare("select article_id from comments where id = ?").get(id) as { article_id: number } | undefined;
  if (!row) throw new NotFoundError("Comment not found.");
  return row.article_id;
}

/** Changes a comment's moderation status and returns the article it belongs to (for cache invalidation). */
export function setCommentStatus(id: number, status: CommentStatus, now = new Date()) {
  const articleId = commentArticleId(id);
  getDb()
    .prepare("update comments set status = ?, reviewed_at = ? where id = ?")
    .run(status, status === "pending" ? null : now.toISOString(), id);
  return { articleId };
}

export function deleteComment(id: number) {
  const articleId = commentArticleId(id);
  getDb().prepare("delete from comments where id = ?").run(id);
  return { articleId };
}

export { publishedArticleLocation };

/** Cache tags to drop when an article's public comment list changes. */
export function commentCacheTags(articleId: number) {
  return [publicArticleCommentsTag(articleId)];
}
