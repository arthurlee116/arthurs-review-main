import { getDb } from "@/lib/db/connection";
import { enqueueJob, requeueJob, type JobStatus } from "@/lib/jobs/queue";
import type { SemanticModelIdentity } from "./vector";

type PublishedRevisionRow = { id: number; revision_id: number };
type ExistingJobRow = { status: JobStatus };

export function enqueueSemanticSearchBackfill({
  identity,
  force = false,
  now = new Date(),
}: {
  identity: SemanticModelIdentity;
  force?: boolean;
  now?: Date;
}) {
  if (!identity.modelId.trim() || !identity.modelRevision.trim() || !Number.isInteger(identity.dimension) || identity.dimension <= 0) {
    throw new Error("A complete semantic embedding model identity is required for backfill.");
  }
  const db = getDb();
  const rows = db
    .prepare(
      `select articles.id, articles.published_revision_id as revision_id
       from articles
       where articles.published_revision_id is not null
       order by articles.id`,
    )
    .all() as PublishedRevisionRow[];
  const result = { published: rows.length, enqueued: 0, skippedIndexed: 0, alreadyPending: 0 };

  db.transaction(() => {
    for (const row of rows) {
      const indexed = db
        .prepare(
          `select 1
           from article_embedding_chunks
           where article_id = ? and revision_id = ? and model_id = ? and model_revision = ? and dimension = ?
           limit 1`,
        )
        .get(row.id, row.revision_id, identity.modelId, identity.modelRevision, identity.dimension);
      if (indexed && !force) {
        result.skippedIndexed += 1;
        continue;
      }

      const dedupeKey = `article:${row.id}:revision:${row.revision_id}`;
      const existing = db
        .prepare("select status from jobs where type = 'search.embed' and dedupe_key = ?")
        .get(dedupeKey) as ExistingJobRow | undefined;
      if (existing?.status === "queued" || existing?.status === "running") {
        result.alreadyPending += 1;
        continue;
      }
      if (existing) {
        requeueJob(
          {
            type: "search.embed",
            payload: { articleId: row.id, revisionId: row.revision_id },
            dedupeKey,
            maxAttempts: 12,
            now,
          },
          db,
        );
      } else {
        enqueueJob(
          {
            type: "search.embed",
            payload: { articleId: row.id, revisionId: row.revision_id },
            dedupeKey,
            maxAttempts: 12,
            now,
          },
          db,
        );
      }
      result.enqueued += 1;
    }
  }).immediate();

  return result;
}
