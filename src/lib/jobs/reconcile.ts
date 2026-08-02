import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { enqueueJob } from "./queue";

// Re-enqueues durable jobs for proofs whose evidence is incomplete. Runs at
// worker startup so proofs orphaned by a crashed/absent worker (or a terminal
// status from an older code path) get picked up again. enqueueJob dedupes on
// (type, dedupe_key), so this never duplicates in-flight work.
export function reconcileUnfinishedProofs(db: Database.Database = getDb()) {
  const unfinishedOts = `
    select id from publication_proofs
    where ots_status in ('submitted', 'pending_confirmation', 'verification_failed')
      and ots_error is not 'Proof source document hash mismatch.'`;
  const unfinishedWayback = `
    select id from publication_proofs
    where wayback_status in ('pending', 'failed')`;

  const otsIds = (db.prepare(unfinishedOts).all() as Array<{ id: number }>).map(({ id }) => id);
  const waybackIds = (db.prepare(unfinishedWayback).all() as Array<{ id: number }>).map(({ id }) => id);

  db.transaction(() => {
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
