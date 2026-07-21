import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { closeDb } from "@/lib/db/connection";
import { runWorker } from "@/lib/jobs/worker";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
runWorker({ workerId, signal: controller.signal })
  .catch((error: unknown) => {
    console.error("Durable job worker stopped", error);
    process.exitCode = 1;
  })
  .finally(closeDb);
