import { setTimeout as delay } from "node:timers/promises";
import { createJobHandlers } from "./handlers";
import { runNextJob, type JobHandlers } from "./queue";

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
