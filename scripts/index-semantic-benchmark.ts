import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { migrate } from "../src/lib/db/migrate";
import { getDb } from "../src/lib/db/connection";
import { createSemanticSearchClient } from "../src/lib/semantic/client";
import { indexPublishedArticleRevision } from "../src/lib/semantic/indexing";

async function main() {
  function option(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    return value;
  }
  for (let index = 2; index < process.argv.length; index += 2) {
    if (!["--output", "--document-prefix"].includes(process.argv[index]!)) {
      throw new Error(`Unknown argument: ${process.argv[index]}`);
    }
  }
  const outputPath = option("--output");
  const documentPrefix = option("--document-prefix");
  const baseClient = createSemanticSearchClient();
  if (!baseClient) throw new Error("Pinned semantic search environment is required.");
  const client = documentPrefix
    ? {
        config: baseClient.config,
        embed: (kind: "query" | "document", texts: readonly string[]) =>
          baseClient.embed(kind, kind === "document" ? texts.map((text) => `${documentPrefix}${text}`) : texts),
      }
    : baseClient;
  migrate();
  const rows = getDb()
  .prepare(
    `select id as article_id, published_revision_id as revision_id
     from articles
     where published_revision_id is not null
     order by id`,
  )
  .all() as { article_id: number; revision_id: number }[];

  const started = performance.now();
  const results: Array<Awaited<ReturnType<typeof indexPublishedArticleRevision>> & { durationMs: number }> = [];
  for (const row of rows) {
    const articleStarted = performance.now();
    const result = await indexPublishedArticleRevision(row.article_id, row.revision_id, { client });
    results.push({ ...result, durationMs: performance.now() - articleStarted });
  }
  const output = {
      model: client.config.embedding,
      documentPrefix: documentPrefix || null,
      articleCount: rows.length,
      chunkCount: results.reduce((sum, result) => sum + (result.status === "indexed" ? result.chunkCount : 0), 0),
      durationMs: performance.now() - started,
      results,
    };
  if (outputPath) {
    const destination = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(output));
}

void main();
