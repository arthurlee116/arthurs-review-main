import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";

export type JobType =
  | "proof.create"
  | "proof.ots_upgrade_verify"
  | "proof.wayback_capture"
  | "cache.invalidate"
  | "translation.article";

export type JobStatus = "queued" | "running" | "succeeded" | "dead";

export type Job = {
  id: number;
  type: JobType;
  payload: unknown;
  dedupeKey: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobRow = {
  id: number;
  type: JobType;
  payload: string;
  dedupe_key: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type JobHandlers = Partial<Record<JobType, (job: Job) => Promise<void>>>;

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
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
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function enqueueJob(
  {
    type,
    payload,
    dedupeKey,
    maxAttempts = 8,
    runAt,
    now = new Date(),
  }: {
    type: JobType;
    payload: unknown;
    dedupeKey: string;
    maxAttempts?: number;
    runAt?: Date;
    now?: Date;
  },
  db: Database.Database = getDb(),
) {
  const timestamp = now.toISOString();
  db.prepare(
    `insert into jobs(type, payload, dedupe_key, max_attempts, run_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict(type, dedupe_key) do nothing`,
  ).run(type, JSON.stringify(payload), dedupeKey, maxAttempts, (runAt ?? now).toISOString(), timestamp, timestamp);
  const row = db.prepare("select * from jobs where type = ? and dedupe_key = ?").get(type, dedupeKey) as JobRow;
  return mapJob(row);
}

export function getJob(id: number) {
  const row = getDb().prepare("select * from jobs where id = ?").get(id) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export function claimNextJob({
  workerId,
  now = new Date(),
  staleAfterMs = 15 * 60 * 1000,
}: {
  workerId: string;
  now?: Date;
  staleAfterMs?: number;
}) {
  const db = getDb();
  return db.transaction(() => {
    const timestamp = now.toISOString();
    const staleBefore = new Date(now.getTime() - staleAfterMs).toISOString();
    db.prepare(
      `update jobs
       set status = 'dead', locked_at = null, locked_by = null,
           last_error = coalesce(last_error, 'Worker lock expired after final attempt.'), updated_at = ?
       where status = 'running' and locked_at <= ? and attempts >= max_attempts`,
    ).run(timestamp, staleBefore);
    db.prepare(
      `update jobs
       set status = 'queued', locked_at = null, locked_by = null, run_at = ?, updated_at = ?
       where status = 'running' and locked_at <= ? and attempts < max_attempts`,
    ).run(timestamp, timestamp, staleBefore);

    const candidate = db
      .prepare("select id from jobs where status = 'queued' and run_at <= ? order by run_at, id limit 1")
      .get(timestamp) as { id: number } | undefined;
    if (!candidate) return null;
    const updated = db
      .prepare(
        `update jobs
         set status = 'running', attempts = attempts + 1, locked_at = ?, locked_by = ?, updated_at = ?
         where id = ? and status = 'queued'`,
      )
      .run(timestamp, workerId, timestamp, candidate.id);
    if (updated.changes !== 1) return null;
    return mapJob(db.prepare("select * from jobs where id = ?").get(candidate.id) as JobRow);
  }).immediate();
}

export function completeJob(id: number, workerId: string, now = new Date()) {
  const timestamp = now.toISOString();
  const result = getDb()
    .prepare(
      `update jobs
       set status = 'succeeded', locked_at = null, locked_by = null, last_error = null, updated_at = ?
       where id = ? and status = 'running' and locked_by = ?`,
    )
    .run(timestamp, id, workerId);
  if (result.changes !== 1) throw new Error("Job lock is no longer owned by this worker.");
}

export function failJob(
  id: number,
  workerId: string,
  error: unknown,
  { now = new Date(), baseDelayMs = 60_000 }: { now?: Date; baseDelayMs?: number } = {},
) {
  const db = getDb();
  const row = db.prepare("select attempts, max_attempts from jobs where id = ? and status = 'running' and locked_by = ?").get(id, workerId) as
    | { attempts: number; max_attempts: number }
    | undefined;
  if (!row) throw new Error("Job lock is no longer owned by this worker.");
  const exhausted = row.attempts >= row.max_attempts;
  const delay = Math.min(baseDelayMs * 2 ** Math.max(0, row.attempts - 1), 60 * 60 * 1000);
  const timestamp = now.toISOString();
  getDb()
    .prepare(
      `update jobs
       set status = ?, run_at = ?, locked_at = null, locked_by = null, last_error = ?, updated_at = ?
       where id = ?`,
    )
    .run(exhausted ? "dead" : "queued", new Date(now.getTime() + delay).toISOString(), errorMessage(error), timestamp, id);
}

export function deadJob(id: number, workerId: string, error: unknown, now = new Date()) {
  const result = getDb()
    .prepare(
      `update jobs
       set status = 'dead', locked_at = null, locked_by = null, last_error = ?, updated_at = ?
       where id = ? and status = 'running' and locked_by = ?`,
    )
    .run(errorMessage(error), now.toISOString(), id, workerId);
  if (result.changes !== 1) throw new Error("Job lock is no longer owned by this worker.");
}

export async function runNextJob({
  workerId,
  handlers,
  now = new Date(),
  baseDelayMs = 60_000,
}: {
  workerId: string;
  handlers: JobHandlers;
  now?: Date;
  baseDelayMs?: number;
}) {
  const job = claimNextJob({ workerId, now });
  if (!job) return null;
  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`No handler registered for ${job.type}.`);
    await handler(job);
    completeJob(job.id, workerId, now);
  } catch (error) {
    if (error instanceof PermanentJobError) deadJob(job.id, workerId, error, now);
    else failJob(job.id, workerId, error, { now, baseDelayMs });
  }
  return getJob(job.id);
}
