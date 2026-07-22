import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { getDb } from "../src/lib/db/connection";
import {
  aggregateRetrievalMetrics,
  retrievalMetrics,
  summarizeLatencyMs,
  validateBenchmarkDataset,
} from "../src/lib/semantic/benchmark";
import { createSemanticSearchClient } from "../src/lib/semantic/client";
import { rankDenseArticleChunks, type StoredEmbeddingChunk } from "../src/lib/semantic/vector";
import {
  searchArticleResults,
  searchArticleResultsHybrid,
  type HybridSearchTrace,
} from "../src/lib/services/search";

type Mode = "fts" | "dense" | "rrf" | "rerank";
type Split = "dev" | "held_out" | "all";

async function main() {

function readOption(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index]!;
  if (!["--dataset", "--output", "--mode", "--split", "--limit", "--query-prefix"].includes(argument)) {
    throw new Error(`Unknown argument: ${argument}`);
  }
  index += 1;
}

const datasetPath = path.resolve(readOption("--dataset", "benchmarks/semantic-search/questions.json")!);
const outputPath = path.resolve(readOption("--output", "benchmarks/semantic-search/results/latest.json")!);
const mode = readOption("--mode", "fts") as Mode;
const split = readOption("--split", "dev") as Split;
const limit = Number(readOption("--limit", "0"));
const queryPrefix = readOption("--query-prefix", "")!;
if (!["fts", "dense", "rrf", "rerank"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
if (!["dev", "held_out", "all"].includes(split)) throw new Error(`Unsupported split: ${split}`);
if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");

const db = getDb();
const articles = db
  .prepare(
    `select a.id, r.slug
     from articles as a
     join article_revisions as r on r.id = a.published_revision_id
     order by a.id`,
  )
  .all() as { id: number; slug: string }[];
const slugById = new Map(articles.map((article) => [article.id, article.slug]));
const withSlug = <Row extends { articleId: number }>(row: Row) => ({
  ...row,
  slug: slugById.get(row.articleId) ?? `missing-article-${row.articleId}`,
});
const rawDataset = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as unknown;
const referencedSlugs = Array.isArray((rawDataset as { questions?: unknown }).questions)
  ? [
      ...new Set(
        ((rawDataset as { questions: unknown[] }).questions).flatMap((question) => {
          if (!question || typeof question !== "object") return [];
          const row = question as { primarySlug?: unknown; relevantSlugs?: unknown };
          return [
            ...(typeof row.primarySlug === "string" ? [row.primarySlug] : []),
            ...(Array.isArray(row.relevantSlugs) ? row.relevantSlugs.filter((slug): slug is string => typeof slug === "string") : []),
          ];
        }),
      ),
    ]
  : [];
const dataset = validateBenchmarkDataset(rawDataset, referencedSlugs);
const availableSlugs = new Set(articles.map((article) => article.slug));
for (const slug of referencedSlugs) {
  if (!availableSlugs.has(slug)) throw new Error(`Benchmark article is missing from the active database: ${slug}`);
}
let questions = dataset.questions.filter((question) => split === "all" || question.split === split);
if (limit > 0) questions = questions.slice(0, limit);
if (questions.length === 0) throw new Error("No benchmark questions matched the requested split.");

const baseClient = mode === "fts" ? null : createSemanticSearchClient();
if (mode !== "fts" && !baseClient) throw new Error("Semantic model environment is required for this mode.");
const client =
  baseClient && queryPrefix
    ? {
        config: baseClient.config,
        embed: (kind: "query" | "document", texts: readonly string[]) =>
          baseClient.embed(kind, kind === "query" ? texts.map((text) => `${queryPrefix}${text}`) : texts),
        rerank: (query: string, candidates: readonly { id: string; text: string }[]) => baseClient.rerank(query, candidates),
      }
    : baseClient;

const denseRows =
  mode === "dense"
    ? (db
        .prepare(
          `select chunks.article_id as articleId,
                  chunks.model_id as modelId,
                  chunks.model_revision as modelRevision,
                  chunks.dimension,
                  chunks.chunk_index as chunkIndex,
                  chunks.language,
                  chunks.content,
                  chunks.embedding,
                  coalesce(articles.published_at, articles.updated_at) as publishedAt
           from article_embedding_chunks as chunks
           join articles on articles.id = chunks.article_id
                        and articles.published_revision_id = chunks.revision_id
           where chunks.model_id = ? and chunks.model_revision = ? and chunks.dimension = ?
           order by chunks.article_id, chunks.chunk_index`,
        )
        .all(client!.config.embedding.modelId, client!.config.embedding.modelRevision, client!.config.embedding.dimension) as StoredEmbeddingChunk[])
    : [];
if (mode === "dense" && denseRows.length === 0) throw new Error("No current embedding rows were found for the configured model.");

const runStarted = performance.now();
const results: Array<{
  questionId: string;
  kind: (typeof questions)[number]["kind"];
  split: (typeof questions)[number]["split"];
  query: string;
  primarySlug: string;
  relevantSlugs: string[];
  rankedSlugs: string[];
  trace: unknown;
  metrics: ReturnType<typeof retrievalMetrics>;
  durationMs: number;
  stageTimingMs?: { embedding: number; denseScan: number };
}> = [];
for (const question of questions) {
  const started = performance.now();
  let rankedSlugs: string[];
  let trace: unknown;
  let stageTimingMs: { embedding: number; denseScan: number } | undefined;
  if (mode === "fts") {
    rankedSlugs = searchArticleResults(question.query, { pageSize: 100 }).results.map((result) => result.article.slug);
    trace = {
      fts: rankedSlugs.map((slug, index) => ({ slug, rank: index + 1, score: null })),
      dense: [],
      final: rankedSlugs.map((slug, index) => ({ slug, rank: index + 1, score: null })),
    };
  } else if (mode === "dense") {
    const embeddingStarted = performance.now();
    const embedded = await client!.embed("query", [question.query]);
    const embeddingDurationMs = performance.now() - embeddingStarted;
    const denseScanStarted = performance.now();
    const ranking = rankDenseArticleChunks(denseRows, embedded.vectors[0]!, client!.config.embedding, 30);
    stageTimingMs = {
      embedding: embeddingDurationMs,
      denseScan: performance.now() - denseScanStarted,
    };
    rankedSlugs = ranking.candidates.map((candidate) => slugById.get(candidate.articleId)).filter((slug): slug is string => Boolean(slug));
    trace = {
      fts: [],
      dense: ranking.candidates.map((candidate, index) => ({
        articleId: candidate.articleId,
        slug: slugById.get(candidate.articleId) ?? `missing-article-${candidate.articleId}`,
        rank: index + 1,
        cosineScore: candidate.score,
        chunkIndex: candidate.chunkIndex,
        language: candidate.language,
      })),
      final: ranking.candidates.map((candidate, index) => ({
        articleId: candidate.articleId,
        slug: slugById.get(candidate.articleId) ?? `missing-article-${candidate.articleId}`,
        rank: index + 1,
        cosineScore: candidate.score,
        chunkIndex: candidate.chunkIndex,
      })),
    };
  } else {
    let hybridTrace: HybridSearchTrace | undefined;
    const page = await searchArticleResultsHybrid(question.query, {
      pageSize: 100,
      client: client!,
      rerankEnabled: mode === "rerank",
      onTrace: (value) => {
        hybridTrace = value;
      },
    });
    rankedSlugs = page.results.map((result) => result.article.slug);
    trace = hybridTrace
      ? {
          fts: hybridTrace.fts.map(withSlug),
          dense: hybridTrace.dense.map(withSlug),
          final: hybridTrace.final.map(withSlug),
        }
      : null;
  }
  results.push({
    questionId: question.id,
    kind: question.kind,
    split: question.split,
    query: question.query,
    primarySlug: question.primarySlug,
    relevantSlugs: question.relevantSlugs,
    rankedSlugs,
    trace,
    metrics: retrievalMetrics(rankedSlugs, question.relevantSlugs),
    durationMs: performance.now() - started,
    stageTimingMs,
  });
}

function summarize(rows: typeof results) {
  return aggregateRetrievalMetrics(rows.map((row) => ({ rankedSlugs: row.rankedSlugs, relevantSlugs: row.relevantSlugs })));
}

const byKind = Object.fromEntries(
  ["lexical", "semantic", "contrastive", "cross_lingual"].map((kind) => {
    const rows = results.filter((result) => result.kind === kind);
    return [kind, rows.length > 0 ? summarize(rows) : null];
  }),
);
const durationMs = performance.now() - runStarted;
const output = {
  schemaVersion: 1,
  mode,
  requestedSplit: split,
  model: client?.config ?? null,
  queryPrefix: queryPrefix || null,
  dataset: path.relative(process.cwd(), datasetPath),
  createdAt: new Date().toISOString(),
  durationMs,
  latencyMs: summarizeLatencyMs(results.map((result) => result.durationMs)),
  stageLatencyMs:
    mode === "dense"
      ? {
          embedding: summarizeLatencyMs(results.map((result) => result.stageTimingMs!.embedding)),
          denseScan: summarizeLatencyMs(results.map((result) => result.stageTimingMs!.denseScan)),
        }
      : null,
  summary: summarize(results),
  byKind,
  results,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporary = `${outputPath}.partial`;
fs.writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
fs.renameSync(temporary, outputPath);
console.log(JSON.stringify({ output: outputPath, mode, split, durationMs, summary: output.summary }));
}

void main();
