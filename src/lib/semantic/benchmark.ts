import { z } from "zod";

const QuestionKindSchema = z.enum(["lexical", "semantic", "contrastive", "cross_lingual"]);
const SplitSchema = z.enum(["dev", "held_out"]);

const BenchmarkQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+-(?:lexical|semantic|contrastive|cross-lingual)-\d{2}$/),
  kind: QuestionKindSchema,
  split: SplitSchema,
  query: z.string().trim().min(2).max(240),
  primarySlug: z.string().min(1),
  relevantSlugs: z.array(z.string().min(1)).min(1),
  rationale: z.string().trim().min(8).max(500),
});

const BenchmarkDatasetSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    publishedArticleCount: z.literal(27),
    language: z.literal("zh-majority"),
    preparedAt: z.string().date(),
  }),
  questions: z.array(BenchmarkQuestionSchema).length(270),
});

export type BenchmarkQuestion = z.infer<typeof BenchmarkQuestionSchema>;
export type BenchmarkDataset = z.infer<typeof BenchmarkDatasetSchema>;

function fail(message: string): never {
  throw new Error(`Invalid semantic benchmark: ${message}`);
}

export function validateBenchmarkDataset(raw: unknown, knownSlugs: readonly string[]): BenchmarkDataset {
  const parsed = BenchmarkDatasetSchema.parse(raw);
  const known = new Set(knownSlugs);
  if (known.size !== 27) fail("known slug list must contain 27 unique articles.");

  const ids = new Set<string>();
  const normalizedQueries = new Set<string>();
  for (const question of parsed.questions) {
    if (ids.has(question.id)) fail(`duplicate id: ${question.id}`);
    ids.add(question.id);
    const normalized = question.query.normalize("NFKC").trim().toLocaleLowerCase();
    if (normalizedQueries.has(normalized)) fail(`duplicate query: ${question.query}`);
    normalizedQueries.add(normalized);
    if (!known.has(question.primarySlug)) fail(`unknown slug: ${question.primarySlug}`);
    if (!question.relevantSlugs.includes(question.primarySlug)) {
      fail(`primary slug is not relevant for ${question.id}`);
    }
    for (const slug of question.relevantSlugs) {
      if (!known.has(slug)) fail(`unknown slug: ${slug}`);
    }
  }

  const quotas: Record<BenchmarkQuestion["kind"], number> = {
    lexical: 2,
    semantic: 5,
    contrastive: 2,
    cross_lingual: 1,
  };
  for (const slug of known) {
    const questions = parsed.questions.filter((question) => question.primarySlug === slug);
    if (questions.length !== 10) fail(`${slug} must have exactly 10 questions.`);
    for (const [kind, expected] of Object.entries(quotas)) {
      const actual = questions.filter((question) => question.kind === kind).length;
      if (actual !== expected) fail(`${slug} must have ${expected} ${kind} questions, found ${actual}.`);
    }
    const dev = questions.filter((question) => question.split === "dev").length;
    const heldOut = questions.filter((question) => question.split === "held_out").length;
    if (dev !== 7 || heldOut !== 3) fail(`${slug} must have a 7/3 dev/held_out split.`);
  }
  return parsed;
}

export type RetrievalMetrics = {
  hitAt1: number;
  hitAt3: number;
  hitAt10: number;
  reciprocalRankAt10: number;
  ndcgAt10: number;
};

export function retrievalMetrics(rankedSlugs: readonly string[], relevantSlugs: readonly string[]): RetrievalMetrics {
  const relevant = new Set(relevantSlugs);
  const ranking = [...new Set(rankedSlugs)].slice(0, 10);
  const firstRelevant = ranking.findIndex((slug) => relevant.has(slug));
  let dcg = 0;
  for (let index = 0; index < ranking.length; index += 1) {
    if (relevant.has(ranking[index]!)) dcg += 1 / Math.log2(index + 2);
  }
  let idealDcg = 0;
  for (let index = 0; index < Math.min(relevant.size, 10); index += 1) {
    idealDcg += 1 / Math.log2(index + 2);
  }
  return {
    hitAt1: firstRelevant === 0 ? 1 : 0,
    hitAt3: firstRelevant >= 0 && firstRelevant < 3 ? 1 : 0,
    hitAt10: firstRelevant >= 0 ? 1 : 0,
    reciprocalRankAt10: firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0,
    ndcgAt10: idealDcg > 0 ? dcg / idealDcg : 0,
  };
}

export function aggregateRetrievalMetrics(
  rows: readonly { rankedSlugs: readonly string[]; relevantSlugs: readonly string[] }[],
) {
  if (rows.length === 0) throw new Error("Cannot aggregate an empty retrieval result set.");
  const totals = rows.reduce(
    (sum, row) => {
      const metrics = retrievalMetrics(row.rankedSlugs, row.relevantSlugs);
      sum.hitAt1 += metrics.hitAt1;
      sum.hitAt3 += metrics.hitAt3;
      sum.hitAt10 += metrics.hitAt10;
      sum.mrrAt10 += metrics.reciprocalRankAt10;
      sum.ndcgAt10 += metrics.ndcgAt10;
      return sum;
    },
    { hitAt1: 0, hitAt3: 0, hitAt10: 0, mrrAt10: 0, ndcgAt10: 0 },
  );
  return {
    count: rows.length,
    hitAt1: totals.hitAt1 / rows.length,
    hitAt3: totals.hitAt3 / rows.length,
    hitAt10: totals.hitAt10 / rows.length,
    mrrAt10: totals.mrrAt10 / rows.length,
    ndcgAt10: totals.ndcgAt10 / rows.length,
  };
}

export function summarizeLatencyMs(values: readonly number[]) {
  if (values.length === 0) throw new Error("Cannot summarize an empty latency result set.");
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Latency values must be finite non-negative numbers.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const nearestRank = (quantile: number) => sorted[Math.ceil(quantile * sorted.length) - 1]!;
  return {
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: nearestRank(0.5),
    p95: nearestRank(0.95),
    max: sorted[sorted.length - 1]!,
  };
}
