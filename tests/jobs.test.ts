import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-jobs-"));
  process.env.DATA_DIR = tmpDir;
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("durable jobs", () => {
  it("enqueues in the caller transaction and rolls back with the mutation", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { enqueueJob } = await import("@/lib/jobs/queue");
    const db = getDb();

    expect(() =>
      db.transaction(() => {
        enqueueJob({ type: "cache.invalidate", payload: { tags: ["public:article-lists"] }, dedupeKey: "rollback" }, db);
        throw new Error("mutation failed");
      })(),
    ).toThrow("mutation failed");
    expect(db.prepare("select count(*) as count from jobs").get()).toEqual({ count: 0 });
  });

  it("lets only one worker claim a queued job", async () => {
    const { claimNextJob, enqueueJob } = await import("@/lib/jobs/queue");
    const now = new Date("2026-07-21T00:00:00.000Z");
    const queued = enqueueJob({ type: "proof.create", payload: { articleId: 1, revisionId: 3 }, dedupeKey: "article:1:revision:3", now });

    expect(claimNextJob({ workerId: "worker-a", now })).toMatchObject({ id: queued.id, status: "running", attempts: 1 });
    expect(claimNextJob({ workerId: "worker-b", now })).toBeNull();
  });

  it("reclaims a stale running lock after a worker crash", async () => {
    const { claimNextJob, enqueueJob } = await import("@/lib/jobs/queue");
    const firstNow = new Date("2026-07-21T00:00:00.000Z");
    enqueueJob({ type: "proof.wayback_capture", payload: { proofId: 1 }, dedupeKey: "proof:1", now: firstNow });
    claimNextJob({ workerId: "dead-worker", now: firstNow, staleAfterMs: 60_000 });

    const reclaimed = claimNextJob({ workerId: "new-worker", now: new Date("2026-07-21T00:02:00.000Z"), staleAfterMs: 60_000 });

    expect(reclaimed).toMatchObject({ lockedBy: "new-worker", attempts: 2 });
  });

  it("retries recoverable failures and moves an exhausted job to dead", async () => {
    const { claimNextJob, enqueueJob, failJob, getJob } = await import("@/lib/jobs/queue");
    const now = new Date("2026-07-21T00:00:00.000Z");
    const queued = enqueueJob({ type: "proof.ots_upgrade_verify", payload: { proofId: 1 }, dedupeKey: "proof:1", maxAttempts: 2, now });
    const first = claimNextJob({ workerId: "worker", now })!;
    failJob(first.id, "worker", new Error("pending confirmation"), { now, baseDelayMs: 0 });
    expect(getJob(queued.id)).toMatchObject({ status: "queued", attempts: 1, lastError: "pending confirmation" });

    const second = claimNextJob({ workerId: "worker", now })!;
    failJob(second.id, "worker", new Error("still pending"), { now, baseDelayMs: 0 });

    expect(getJob(queued.id)).toMatchObject({ status: "dead", attempts: 2, lastError: "still pending" });
  });

  it("deduplicates one job type/revision without swallowing another revision", async () => {
    const { enqueueJob } = await import("@/lib/jobs/queue");
    const first = enqueueJob({ type: "proof.create", payload: { revisionId: 10 }, dedupeKey: "revision:10" });
    const duplicate = enqueueJob({ type: "proof.create", payload: { revisionId: 10 }, dedupeKey: "revision:10" });
    const next = enqueueJob({ type: "proof.create", payload: { revisionId: 11 }, dedupeKey: "revision:11" });

    expect(duplicate.id).toBe(first.id);
    expect(next.id).not.toBe(first.id);
  });

  it("continues a failed job under a new worker", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("process stopped")).mockResolvedValueOnce(undefined);
    const { enqueueJob, getJob, runNextJob } = await import("@/lib/jobs/queue");
    const now = new Date("2026-07-21T00:00:00.000Z");
    const queued = enqueueJob({ type: "cache.invalidate", payload: { tags: ["public:article-lists"] }, dedupeKey: "restart", maxAttempts: 3, now });
    const options = { now, baseDelayMs: 0 };

    await runNextJob({ workerId: "worker-before-restart", handlers: { "cache.invalidate": handler }, ...options });
    await runNextJob({ workerId: "worker-after-restart", handlers: { "cache.invalidate": handler }, ...options });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(getJob(queued.id)?.status).toBe("succeeded");
  });

  it("rolls a Publish back when its durable outbox cannot be written", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, getArticleById, publishArticle } = await import("@/lib/services/articles");
    const article = createArticle(articleInput());
    const db = getDb();
    db.exec(`
      create trigger reject_publish_proof_job
      before insert on jobs
      when new.type = 'proof.create'
      begin
        select raise(abort, 'outbox unavailable');
      end
    `);

    expect(() => publishArticle(article.id)).toThrow("outbox unavailable");
    expect(getArticleById(article.id, { includeDraft: false })).toBeNull();
    expect(db.prepare("select count(*) as count from jobs").get()).toEqual({ count: 0 });
  });

  it("binds Publish jobs to the exact immutable revision", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const published = publishArticle(createArticle(articleInput()).id);
    const rows = getDb()
      .prepare("select type, payload from jobs order by id")
      .all() as Array<{ type: string; payload: string }>;

    expect(rows.map((row) => row.type)).toEqual(["proof.create", "search.embed", "cache.invalidate"]);
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      articleId: published.id,
      revisionId: published.revisionId,
      publishedAt: published.publishedAt,
      updatedAt: published.updatedAt,
    });
    expect(JSON.parse(rows[1]!.payload)).toEqual({
      articleId: published.id,
      revisionId: published.revisionId,
    });
    expect(JSON.parse(rows[2]!.payload)).toEqual({
      tags: [
        "public:article-lists",
        "public:article:commentary:short-note-with-warmth",
        "public:proofs",
        `public:proofs:article:${published.id}`,
      ],
    });
  });

  it("invalidates proof listings when a published article disappears", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle, unpublishArticle } = await import("@/lib/services/articles");
    const article = publishArticle(createArticle(articleInput()).id);
    const db = getDb();
    db.prepare("delete from jobs").run();

    unpublishArticle(article.id);

    const job = db.prepare("select payload from jobs where type = 'cache.invalidate'").get() as { payload: string };
    expect(JSON.parse(job.payload)).toEqual({
      tags: [
        "public:article-lists",
        "public:article:commentary:short-note-with-warmth",
        "public:proofs",
        `public:proofs:article:${article.id}`,
      ],
    });
  });

  it("loads the queued revision even after a newer draft exists", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const published = publishArticle(createArticle(articleInput({ bodyZh: "发布正文" })).id);
    updateArticle(published.id, articleInput({ bodyZh: "较新的未发布草稿" }), published.draftRevisionId);
    const row = getDb().prepare("select * from jobs where type = 'proof.create'").get() as {
      id: number;
      payload: string;
      dedupe_key: string;
      status: "queued";
      attempts: number;
      max_attempts: number;
      run_at: string;
      locked_at: null;
      locked_by: null;
      last_error: null;
      created_at: string;
      updated_at: string;
      type: "proof.create";
    };
    const ensurePublicationProofRecord = vi.fn(() => ({
      id: 81,
      articleId: published.id,
      articleRevisionId: published.revisionId,
      createdAt: published.updatedAt,
      publicUrl: "https://blog.leesaitool.com/commentary/short-note-with-warmth",
      contentFingerprint: "fingerprint",
      documentSha256: "a".repeat(64),
      documentPath: "proofs/1/proof.json",
      otsPath: null,
      otsStatus: "submitted" as const,
      otsError: null,
      waybackUrl: null,
      waybackStatus: "pending" as const,
      waybackError: null,
    }));
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const handlers = createJobHandlers({ ensurePublicationProofRecord });

    await handlers["proof.create"]!({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      dedupeKey: row.dedupe_key,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      runAt: row.run_at,
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

    expect(ensurePublicationProofRecord).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: published.revisionId, bodyZh: "发布正文", status: "published" }),
      { createdAt: published.updatedAt },
    );
    expect(
      (getDb().prepare("select type from jobs order by id").all() as Array<{ type: string }>).map((job) => job.type),
    ).toEqual([
      "proof.create",
      "search.embed",
      "cache.invalidate",
      "proof.ots_upgrade_verify",
      "proof.wayback_capture",
      "cache.invalidate",
    ]);
  });

  it("dispatches an embedding job with the immutable article revision", async () => {
    const indexPublishedArticleRevision = vi.fn().mockResolvedValue(undefined);
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const handlers = createJobHandlers({ indexPublishedArticleRevision });

    await handlers["search.embed"]!({
      id: 91,
      type: "search.embed",
      payload: { articleId: 7, revisionId: 13 },
      dedupeKey: "article:7:revision:13",
      status: "running",
      attempts: 1,
      maxAttempts: 8,
      runAt: "2026-07-21T00:00:00.000Z",
      lockedAt: "2026-07-21T00:00:00.000Z",
      lockedBy: "worker",
      lastError: null,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });

    expect(indexPublishedArticleRevision).toHaveBeenCalledOnce();
    expect(indexPublishedArticleRevision).toHaveBeenCalledWith(7, 13);
  });

  it("moves permanent failures directly to dead", async () => {
    const { PermanentJobError, enqueueJob, getJob, runNextJob } = await import("@/lib/jobs/queue");
    const now = new Date("2026-07-21T00:00:00.000Z");
    const queued = enqueueJob({ type: "proof.ots_upgrade_verify", payload: { proofId: 1 }, dedupeKey: "permanent", now });

    await runNextJob({
      workerId: "worker",
      now,
      handlers: { "proof.ots_upgrade_verify": async () => { throw new PermanentJobError("receipt mismatch"); } },
    });

    expect(getJob(queued.id)).toMatchObject({ status: "dead", attempts: 1, lastError: "receipt mismatch" });
  });

  it("re-enqueues jobs for unfinished proofs and revives dead proof jobs", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { ensurePublicationProofRecord } = await import("@/lib/services/publication-proofs");
    const { reconcileUnfinishedProofs } = await import("@/lib/jobs/reconcile");
    const { enqueueJob, getJob } = await import("@/lib/jobs/queue");

    const finishedArticle = publishArticle(createArticle(articleInput({ slug: "finished" })).id);
    const unfinishedArticle = publishArticle(createArticle(articleInput({ slug: "unfinished" })).id);
    const db = getDb();
    db.prepare("delete from jobs").run();

    const finished = ensurePublicationProofRecord(finishedArticle, { createdAt: "2026-07-21T00:00:00.000Z" })!;
    const unfinished = ensurePublicationProofRecord(unfinishedArticle, { createdAt: "2026-07-21T00:00:00.000Z" })!;
    db.prepare("update publication_proofs set ots_status = 'anchored', wayback_status = 'complete' where id = ?").run(finished.id);
    db.prepare("update publication_proofs set ots_status = 'verification_failed', wayback_status = 'failed' where id = ?").run(unfinished.id);
    const deadOts = enqueueJob({ type: "proof.ots_upgrade_verify", payload: { proofId: unfinished.id }, dedupeKey: `proof:${unfinished.id}`, maxAttempts: 8 }, db);
    const deadWayback = enqueueJob({ type: "proof.wayback_capture", payload: { proofId: unfinished.id }, dedupeKey: `proof:${unfinished.id}`, maxAttempts: 8 }, db);
    db.prepare("update jobs set status = 'dead', attempts = 8 where id in (?, ?)").run(deadOts.id, deadWayback.id);

    const recovered = reconcileUnfinishedProofs(db);

    expect(recovered).toEqual({ ots: 1, wayback: 1 });
    expect(getJob(deadOts.id)).toMatchObject({ status: "queued", attempts: 0, maxAttempts: 96 });
    expect(getJob(deadWayback.id)).toMatchObject({ status: "queued", attempts: 0, maxAttempts: 24 });
    expect(
      db.prepare("select count(*) as count from jobs where type like 'proof.%'").get(),
    ).toEqual({ count: 2 });
  });
});
