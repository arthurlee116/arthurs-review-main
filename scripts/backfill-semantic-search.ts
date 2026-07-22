import { migrate } from "../src/lib/db/migrate";
import { enqueueSemanticSearchBackfill } from "../src/lib/semantic/backfill";
import { readSemanticSearchConfig } from "../src/lib/semantic/client";

const args = new Set(process.argv.slice(2));
for (const argument of args) {
  if (argument !== "--force") throw new Error(`Unknown argument: ${argument}`);
}

const config = readSemanticSearchConfig();
if (!config) throw new Error("SEMANTIC_SEARCH_URL and pinned model identity are required for backfill.");
migrate();
const result = enqueueSemanticSearchBackfill({ identity: config.embedding, force: args.has("--force") });
console.log(JSON.stringify(result));
