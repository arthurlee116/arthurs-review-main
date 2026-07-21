import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/connection";
import { enqueueJob } from "@/lib/jobs/queue";
import {
  applyTranslationToPublishedRevision,
  getArticleById,
  getArticleRevisionById,
  listPublishedArticlesMissingEnglish,
} from "@/lib/services/articles";
import { getSetting } from "@/lib/services/settings";
import { requestOpenRouterTranslation } from "./openrouter";
import { buildTranslationMessages } from "./prompt";
import { TranslationInputSchema, type TranslationInput, type TranslationOutput } from "./schema";

export type TranslateFunction = (input: TranslationInput, model: string) => Promise<TranslationOutput>;

export type TranslationBatchProgress = {
  id: string;
  model: string;
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  dead: number;
  createdAt: string;
};

type TranslationBatchRow = {
  id: string;
  model: string;
  total_count: number;
  queued: number;
  running: number;
  succeeded: number;
  dead: number;
  created_at: string;
};

export function translationModel() {
  return getSetting("openrouterTranslationModel").trim() || "inclusionai/ring-2.6-1t:free";
}

export async function translateArticleDraft(input: TranslationInput, model = translationModel(), translate: TranslateFunction = defaultTranslate) {
  return translate(TranslationInputSchema.parse(input), model);
}

async function defaultTranslate(input: TranslationInput, model: string) {
  return requestOpenRouterTranslation({
    model,
    messages: buildTranslationMessages(input),
  });
}

function mapBatch(row: TranslationBatchRow): TranslationBatchProgress {
  return {
    id: row.id,
    model: row.model,
    total: row.total_count,
    queued: row.queued,
    running: row.running,
    succeeded: row.succeeded,
    dead: row.dead,
    createdAt: row.created_at,
  };
}

export function getTranslationBatchProgress(batchId: string) {
  const row = getDb()
    .prepare(
      `select translation_batches.*,
              coalesce(sum(jobs.status = 'queued'), 0) as queued,
              coalesce(sum(jobs.status = 'running'), 0) as running,
              coalesce(sum(jobs.status = 'succeeded'), 0) as succeeded,
              coalesce(sum(jobs.status = 'dead'), 0) as dead
       from translation_batches
       left join jobs
         on jobs.type = 'translation.article'
        and json_extract(jobs.payload, '$.batchId') = translation_batches.id
       where translation_batches.id = ?
       group by translation_batches.id`,
    )
    .get(batchId) as TranslationBatchRow | undefined;
  return row ? mapBatch(row) : null;
}

export function enqueuePublishedMissingEnglishTranslations({
  model = translationModel(),
  batchId = randomUUID(),
  now = new Date(),
}: {
  model?: string;
  batchId?: string;
  now?: Date;
} = {}) {
  const articles = listPublishedArticlesMissingEnglish();
  const db = getDb();
  const selectedModel = model.trim() || translationModel();
  db.transaction(() => {
    db.prepare("insert into translation_batches(id, model, total_count, created_at) values (?, ?, ?, ?)")
      .run(batchId, selectedModel, articles.length, now.toISOString());
    for (const article of articles) {
      enqueueJob(
        {
          type: "translation.article",
          payload: {
            batchId,
            articleId: article.id,
            sourceRevisionId: article.revisionId,
            model: selectedModel,
          },
          dedupeKey: `batch:${batchId}:article:${article.id}:revision:${article.revisionId}`,
          maxAttempts: 3,
          now,
        },
        db,
      );
    }
  }).immediate();
  return getTranslationBatchProgress(batchId)!;
}

export async function translatePublishedRevision({
  articleId,
  sourceRevisionId,
  model,
  translate = defaultTranslate,
}: {
  articleId: number;
  sourceRevisionId: number;
  model: string;
  translate?: TranslateFunction;
}) {
  const source = getArticleRevisionById(articleId, sourceRevisionId);
  const current = getArticleById(articleId, { includeDraft: false });
  if (!source?.bodyZh || current?.revisionId !== sourceRevisionId) return { status: "obsolete" as const };
  const translation = await translateArticleDraft(
    { titleZh: source.titleZh, excerptZh: source.excerptZh, bodyZh: source.bodyZh },
    model,
    translate,
  );
  return applyTranslationToPublishedRevision(articleId, sourceRevisionId, translation);
}
