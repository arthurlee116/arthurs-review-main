import type Database from "better-sqlite3";
import type { CategoryId } from "@/lib/content/categories";
import type { Article } from "@/lib/services/articles";
import {
  PUBLIC_ARTICLE_LIST_TAG,
  PUBLIC_PROOFS_TAG,
  publicArticleProofsTag,
  publicArticleTag,
} from "@/lib/services/public-cache-tags";
import { enqueueJob } from "./queue";

export type PublicArticlePath = { category: CategoryId; slug: string };

export function enqueueCacheInvalidation(
  {
    tags,
    dedupeKey,
    now,
  }: {
    tags: string[];
    dedupeKey: string;
    now?: Date;
  },
  db?: Database.Database,
) {
  return enqueueJob(
    {
      type: "cache.invalidate",
      payload: { tags: [...new Set(tags)] },
      dedupeKey,
      maxAttempts: 12,
      now,
    },
    db,
  );
}

export function enqueuePublishedRevisionJobs(
  {
    article,
    oldPath,
  }: {
    article: Article;
    oldPath?: PublicArticlePath | null;
  },
  db: Database.Database,
) {
  enqueueJob(
    {
      type: "proof.create",
      payload: {
        articleId: article.id,
        revisionId: article.revisionId,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
      },
      dedupeKey: `article:${article.id}:revision:${article.revisionId}`,
      maxAttempts: 8,
      now: new Date(article.updatedAt),
    },
    db,
  );

  const semanticJob = enqueueJob(
    {
      type: "search.embed",
      payload: {
        articleId: article.id,
        revisionId: article.revisionId,
      },
      dedupeKey: `article:${article.id}:revision:${article.revisionId}`,
      maxAttempts: 12,
      now: new Date(article.updatedAt),
    },
    db,
  );
  if (semanticJob.status !== "queued" && semanticJob.status !== "running") {
    const indexed = db
      .prepare("select 1 from article_embedding_chunks where article_id = ? and revision_id = ? limit 1")
      .get(article.id, article.revisionId);
    if (!indexed) {
      db.prepare(
        `update jobs
         set payload = ?, status = 'queued', attempts = 0, max_attempts = 12,
             run_at = ?, locked_at = null, locked_by = null, last_error = null, updated_at = ?
         where id = ?`,
      ).run(
        JSON.stringify({ articleId: article.id, revisionId: article.revisionId }),
        article.updatedAt,
        article.updatedAt,
        semanticJob.id,
      );
    }
  }

  return enqueueCacheInvalidation(
    {
      tags: [
        PUBLIC_ARTICLE_LIST_TAG,
        ...(oldPath ? [publicArticleTag(oldPath.category, oldPath.slug)] : []),
        publicArticleTag(article.category, article.slug),
        PUBLIC_PROOFS_TAG,
        publicArticleProofsTag(article.id),
      ],
      dedupeKey: `article:${article.id}:publish:${article.updatedAt}`,
      now: new Date(article.updatedAt),
    },
    db,
  );
}
