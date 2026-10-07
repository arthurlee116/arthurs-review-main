import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { isArticleProofEligible, isPublicationProofEligible, PUBLICATION_PROOF_ELIGIBLE_SQL } from "@/lib/services/proof-eligibility";
import type { CategoryId } from "@/lib/content/categories";
import { enqueueJob } from "./queue";

// Re-enqueues durable jobs for proofs whose evidence is incomplete. Runs at
// worker startup so proofs orphaned by a crashed/absent worker (or a terminal
// status from an older code path) get picked up again. enqueueJob dedupes on
// (type, dedupe_key), so this never duplicates in-flight work.
export function reconcileUnfinishedProofs(db: Database.Database = getDb()) {
  const unfinishedOts = `
    select id from publication_proofs
    where ots_status in ('submitted', 'pending_confirmation', 'verification_failed')
      and ots_error is not 'Proof source document hash mismatch.'
      and ${PUBLICATION_PROOF_ELIGIBLE_SQL}`;
  const unfinishedWayback = `
    select id from publication_proofs
    where wayback_status in ('pending', 'failed') and ${PUBLICATION_PROOF_ELIGIBLE_SQL}`;

  const otsIds = (db.prepare(unfinishedOts).all() as Array<{ id: number }>).map(({ id }) => id);
  const waybackIds = (db.prepare(unfinishedWayback).all() as Array<{ id: number }>).map(({ id }) => id);

  db.transaction(() => {
    // Retire old life tasks without changing evidence records or deleting files.
    const pending = db.prepare(`select id, type, payload from jobs
      where type in ('proof.create', 'proof.ots_upgrade_verify', 'proof.wayback_capture')
        and status in ('queued', 'running', 'dead')`).all() as Array<{ id: number; type: string; payload: string }>;
    for (const job of pending) {
      const payload = JSON.parse(job.payload) as { articleId?: number; revisionId?: number; proofId?: number } | null;
      if (!payload || typeof payload !== "object") continue;
      let eligible: boolean;
      if (job.type === "proof.create") {
        const source = db.prepare("select article_id as id, category from article_revisions where id = ? and article_id = ?")
          .get(payload.revisionId ?? null, payload.articleId ?? null) as { id: number; category: CategoryId } | undefined;
        eligible = !source || isArticleProofEligible(source, db);
      } else {
        eligible = isPublicationProofEligible(payload.proofId ?? 0, db);
      }
      if (!eligible) db.prepare(`update jobs set status = 'succeeded', locked_at = null, locked_by = null,
        last_error = null, updated_at = ? where id = ?`).run(new Date().toISOString(), job.id);
    }
    // Dead jobs from an older terminal-failure path, and running jobs orphaned
    // by a crash, block re-enqueue on their dedupe key — revive them first.
    db.prepare(
      `update jobs set status = 'queued', run_at = ?, locked_at = null, locked_by = null, last_error = null,
              attempts = 0, max_attempts = case type when 'proof.ots_upgrade_verify' then 96 else 24 end
       where status in ('dead', 'running') and (
         (type = 'proof.ots_upgrade_verify' and cast(replace(dedupe_key, 'proof:', '') as integer) in (${unfinishedOts})) or
         (type = 'proof.wayback_capture' and cast(replace(dedupe_key, 'proof:', '') as integer) in (${unfinishedWayback}))
       )`,
    ).run(new Date().toISOString());
    for (const id of otsIds) {
      enqueueJob({ type: "proof.ots_upgrade_verify", payload: { proofId: id }, dedupeKey: `proof:${id}`, maxAttempts: 96 }, db);
    }
    for (const id of waybackIds) {
      enqueueJob({ type: "proof.wayback_capture", payload: { proofId: id }, dedupeKey: `proof:${id}`, maxAttempts: 24 }, db);
    }
  }).immediate();

  return { ots: otsIds.length, wayback: waybackIds.length };
}
