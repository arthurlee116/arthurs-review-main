import { setTimeout as delay } from "node:timers/promises";
import { createJobHandlers } from "./handlers";
import { runNextJob, type JobHandlers } from "./queue";
import { reconcileUnfinishedProofs } from "./reconcile";

export async function runWorker({
  workerId,
  signal,
  handlers = createJobHandlers(),
  pollIntervalMs = 1_000,
}: {
  workerId: string;
  signal: AbortSignal;
  handlers?: JobHandlers;
  pollIntervalMs?: number;
}) {
  const recovered = reconcileUnfinishedProofs();
  if (recovered.ots > 0 || recovered.wayback > 0) {
    console.log(`Re-enqueued jobs for ${recovered.ots} OTS and ${recovered.wayback} Wayback unfinished proofs`);
  }
  while (!signal.aborted) {
    const result = await runNextJob({ workerId, handlers });
    if (result) continue;
    try {
      await delay(pollIntervalMs, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
