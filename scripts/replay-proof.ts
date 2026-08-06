import { migrate } from "@/lib/db/migrate";
import { getDb } from "@/lib/db/connection";
import {
  advanceOpenTimestampProof,
  captureWaybackProof,
} from "@/lib/services/publication-proofs";

// Minimal debug route for the durable jobs/proof pipeline.
//
//   pnpm proof:replay <id>          advance one proof's OTS + Wayback to done
//   pnpm proof:replay --list        list proofs that are still pending or failed
//
// Proof state lives in SQLite (publication_proofs table); this gives a single
// proof the same re-drive the worker runs for all of them, without guessing.

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  migrate();

  const [rawId, ...rest] = process.argv.slice(2);
  const listOnly = rawId === "--list" || rawId === "-l";

  if (listOnly) {
    const rows = getDb()
      .prepare(
        `select id, article_id, ots_status, wayback_status, ots_error, wayback_error
         from publication_proofs
         where ots_status != 'anchored' or wayback_status != 'complete'
         order by id`,
      )
      .all() as Array<{ id: number; article_id: number; ots_status: string; wayback_status: string; ots_error: string | null; wayback_error: string | null }>;

    if (rows.length === 0) {
      console.log("No unfinished publication proofs.");
      return;
    }
    for (const row of rows) {
      console.log(
        `#${row.id} article=${row.article_id} ots=${row.ots_status} wayback=${row.wayback_status}` +
          (row.ots_error ? `\n  ots_error: ${row.ots_error}` : "") +
          (row.wayback_error ? `\n  wayback_error: ${row.wayback_error}` : ""),
      );
    }
    return;
  }

  if (!rawId || rest.length > 0) {
    fail("usage: pnpm proof:replay <id> | pnpm proof:replay --list");
  }
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) fail(`invalid proof id: ${rawId}`);

  let otsError: string | null = null;
  let waybackError: string | null = null;
  let ots: string | null = null;
  let wayback: string | null = null;
  let waybackUrl: string | null = null;

  try {
    const result = await advanceOpenTimestampProof(id);
    ots = result?.otsStatus ?? null;
    otsError = result?.otsError ?? null;
  } catch (error) {
    otsError = error instanceof Error ? error.message : String(error);
  }
  try {
    const result = await captureWaybackProof(id);
    wayback = result?.waybackStatus ?? null;
    waybackUrl = result?.waybackUrl ?? null;
    waybackError = result?.waybackError ?? null;
  } catch (error) {
    waybackError = error instanceof Error ? error.message : String(error);
  }

  console.log(
    JSON.stringify({ id, ots, otsError, wayback, waybackUrl, waybackError }),
  );
  if (ots !== "anchored" || wayback !== "complete") {
    process.exitCode = 1;
  }
}

void main();
