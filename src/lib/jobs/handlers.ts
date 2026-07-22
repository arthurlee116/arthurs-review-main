import { z } from "zod";
import { getDb } from "@/lib/db/connection";
import { getArticleRevisionById, type Article } from "@/lib/services/articles";
import {
  advanceOpenTimestampProof,
  captureWaybackProof,
  ensurePublicationProofRecord,
  getPublicationProof,
} from "@/lib/services/publication-proofs";
import { PUBLIC_PROOFS_TAG, publicArticleProofsTag } from "@/lib/services/public-cache-tags";
import { translatePublishedRevision } from "@/lib/translation/service";
import { indexPublishedArticleRevision } from "@/lib/semantic/indexing";
import { invalidateCacheThroughApp } from "./cache-client";
import { enqueueCacheInvalidation } from "./outbox";
import { enqueueJob, PermanentJobError, type JobHandlers } from "./queue";

const ProofCreatePayload = z.object({
  articleId: z.number().int().positive(),
  revisionId: z.number().int().positive(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string().min(1),
});
const ProofPayload = z.object({ proofId: z.number().int().positive() });
const CachePayload = z.object({
  tags: z.array(z.string().startsWith("public:").max(256)).max(128),
});
const TranslationPayload = z.object({
  batchId: z.string().min(1),
  articleId: z.number().int().positive(),
  sourceRevisionId: z.number().int().positive(),
  model: z.string().min(1),
});
const SearchEmbedPayload = z.object({
  articleId: z.number().int().positive(),
  revisionId: z.number().int().positive(),
});

type JobHandlerDependencies = {
  getArticleRevisionById: typeof getArticleRevisionById;
  ensurePublicationProofRecord: typeof ensurePublicationProofRecord;
  advanceOpenTimestampProof: typeof advanceOpenTimestampProof;
  captureWaybackProof: typeof captureWaybackProof;
  getPublicationProof: typeof getPublicationProof;
  invalidateCache: typeof invalidateCacheThroughApp;
  translatePublishedRevision: typeof translatePublishedRevision;
  indexPublishedArticleRevision: typeof indexPublishedArticleRevision;
};

function enqueueProofCache(articleId: number, proofId: number, state: string) {
  enqueueCacheInvalidation({
    tags: [PUBLIC_PROOFS_TAG, publicArticleProofsTag(articleId)],
    dedupeKey: `proof:${proofId}:cache:${state}`,
  });
}

export function createJobHandlers(overrides: Partial<JobHandlerDependencies> = {}): JobHandlers {
  const dependencies: JobHandlerDependencies = {
    getArticleRevisionById,
    ensurePublicationProofRecord,
    advanceOpenTimestampProof,
    captureWaybackProof,
    getPublicationProof,
    invalidateCache: invalidateCacheThroughApp,
    translatePublishedRevision,
    indexPublishedArticleRevision,
    ...overrides,
  };

  return {
    "proof.create": async (job) => {
      const payload = ProofCreatePayload.parse(job.payload);
      const revision = dependencies.getArticleRevisionById(payload.articleId, payload.revisionId);
      if (!revision) return;
      const article: Article = {
        ...revision,
        revisionId: payload.revisionId,
        publishedRevisionId: payload.revisionId,
        publishedAt: payload.publishedAt,
        updatedAt: payload.updatedAt,
        status: "published",
      };
      const proof = await dependencies.ensurePublicationProofRecord(article, { createdAt: payload.updatedAt });
      if (!proof) return;

      const db = getDb();
      db.transaction(() => {
        enqueueJob(
          {
            type: "proof.ots_upgrade_verify",
            payload: { proofId: proof.id },
            dedupeKey: `proof:${proof.id}`,
            maxAttempts: 96,
          },
          db,
        );
        enqueueJob(
          {
            type: "proof.wayback_capture",
            payload: { proofId: proof.id },
            dedupeKey: `proof:${proof.id}`,
            maxAttempts: 8,
          },
          db,
        );
        enqueueCacheInvalidation(
          {
            tags: [PUBLIC_PROOFS_TAG, publicArticleProofsTag(proof.articleId)],
            dedupeKey: `proof:${proof.id}:created`,
          },
          db,
        );
      }).immediate();
    },

    "proof.ots_upgrade_verify": async (job) => {
      const { proofId } = ProofPayload.parse(job.payload);
      const proof = await dependencies.advanceOpenTimestampProof(proofId);
      if (!proof) return;
      enqueueProofCache(proof.articleId, proof.id, `ots:${proof.otsStatus}`);
      if (proof.otsStatus === "verification_failed") {
        throw new PermanentJobError(proof.otsError ?? "OpenTimestamps verification failed.");
      }
      if (proof.otsStatus !== "anchored") throw new Error("OpenTimestamps confirmation is still pending.");
    },

    "proof.wayback_capture": async (job) => {
      const { proofId } = ProofPayload.parse(job.payload);
      try {
        const proof = await dependencies.captureWaybackProof(proofId);
        if (proof) enqueueProofCache(proof.articleId, proof.id, `wayback:${proof.waybackStatus}`);
      } catch (error) {
        const proof = dependencies.getPublicationProof(proofId);
        if (proof) enqueueProofCache(proof.articleId, proof.id, `wayback:${proof.waybackStatus}`);
        throw error;
      }
    },

    "cache.invalidate": async (job) => {
      const { tags } = CachePayload.parse(job.payload);
      await dependencies.invalidateCache([...new Set(tags)]);
    },

    "translation.article": async (job) => {
      const { articleId, sourceRevisionId, model } = TranslationPayload.parse(job.payload);
      await dependencies.translatePublishedRevision({ articleId, sourceRevisionId, model });
    },

    "search.embed": async (job) => {
      const { articleId, revisionId } = SearchEmbedPayload.parse(job.payload);
      await dependencies.indexPublishedArticleRevision(articleId, revisionId);
    },
  };
}
