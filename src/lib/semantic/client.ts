import { z } from "zod";
import type { SemanticModelIdentity } from "./vector";

export type SemanticSearchConfig = {
  baseUrl: string;
  embedding: SemanticModelIdentity;
  reranker: {
    modelId: string;
    modelRevision: string;
  };
  embedTimeoutMs: number;
  rerankTimeoutMs: number;
};

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const EmbedResponseSchema = z.object({
  model: z.object({
    id: z.string().min(1),
    revision: z.string().min(1),
    dimension: z.number().int().positive(),
  }),
  vectors: z.array(z.array(z.number().finite())),
  tokenCounts: z.array(z.number().int().nonnegative()),
});

const RerankResponseSchema = z.object({
  model: z.object({ id: z.string().min(1), revision: z.string().min(1) }),
  scores: z.array(z.object({ id: z.string().min(1), score: z.number().finite() })),
});

function required(env: Record<string, string | undefined>, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required when SEMANTIC_SEARCH_URL is configured.`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = value === undefined || value.trim() === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 120_000) {
    throw new Error(`${name} must be a positive integer no greater than 120000.`);
  }
  return parsed;
}

export function readSemanticSearchConfig(env: Record<string, string | undefined> = process.env) {
  const rawUrl = env.SEMANTIC_SEARCH_URL?.trim();
  if (!rawUrl) return null;
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("SEMANTIC_SEARCH_URL must use http or https.");
  if (url.username || url.password || url.search || url.hash) throw new Error("SEMANTIC_SEARCH_URL must not contain credentials, query, or fragment.");

  const dimension = positiveInteger(env.SEMANTIC_SEARCH_DIMENSION, 384, "SEMANTIC_SEARCH_DIMENSION");
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    embedding: {
      modelId: required(env, "SEMANTIC_SEARCH_MODEL_ID"),
      modelRevision: required(env, "SEMANTIC_SEARCH_MODEL_REVISION"),
      dimension,
    },
    reranker: {
      modelId: required(env, "SEMANTIC_RERANK_MODEL_ID"),
      modelRevision: required(env, "SEMANTIC_RERANK_MODEL_REVISION"),
    },
    embedTimeoutMs: positiveInteger(env.SEMANTIC_SEARCH_TIMEOUT_MS, 4_000, "SEMANTIC_SEARCH_TIMEOUT_MS"),
    rerankTimeoutMs: positiveInteger(env.SEMANTIC_RERANK_TIMEOUT_MS, 6_000, "SEMANTIC_RERANK_TIMEOUT_MS"),
  } satisfies SemanticSearchConfig;
}

export class SemanticServiceError extends Error {
  constructor(
    message: string,
    readonly reason: "timeout" | "http" | "response" | "network",
  ) {
    super(message);
    this.name = "SemanticServiceError";
  }
}

function validateTexts(texts: readonly string[], maximum: number, label: string) {
  if (texts.length === 0) throw new Error(`${label} requires at least one text.`);
  if (texts.length > maximum) throw new Error(`${label} accepts at most ${maximum} texts.`);
  for (const text of texts) {
    const length = Array.from(text).length;
    if (length === 0 || length > 8_192) throw new Error(`${label} text length must be between 1 and 8192 code points.`);
  }
}

function isNormalized(vector: readonly number[]) {
  const squaredNorm = vector.reduce((sum, value) => sum + value * value, 0);
  return Number.isFinite(squaredNorm) && Math.abs(Math.sqrt(squaredNorm) - 1) <= 0.001;
}

export class SemanticSearchClient {
  constructor(
    readonly config: SemanticSearchConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async post(path: string, body: unknown, timeoutMs: number, operation: "embed" | "rerank") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new SemanticServiceError(`Semantic service returned ${response.status} for ${operation}.`, "http");
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new SemanticServiceError(`Invalid semantic ${operation} response: expected JSON.`, "response");
      }
    } catch (error) {
      if (error instanceof SemanticServiceError) throw error;
      if (controller.signal.aborted) {
        throw new SemanticServiceError(`Semantic ${operation} timed out after ${timeoutMs}ms.`, "timeout");
      }
      throw new SemanticServiceError(`Semantic ${operation} request failed.`, "network");
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(kind: "query" | "document", texts: readonly string[]) {
    validateTexts(texts, 32, "Embedding");
    const raw = await this.post("/embed", { kind, texts }, this.config.embedTimeoutMs, "embed");
    const parsed = EmbedResponseSchema.safeParse(raw);
    if (!parsed.success) throw new SemanticServiceError("Invalid semantic embed response: schema mismatch.", "response");
    const { model, vectors, tokenCounts } = parsed.data;
    const expected = this.config.embedding;
    if (
      model.id !== expected.modelId ||
      model.revision !== expected.modelRevision ||
      model.dimension !== expected.dimension ||
      vectors.length !== texts.length ||
      tokenCounts.length !== texts.length ||
      vectors.some((vector) => vector.length !== expected.dimension || !isNormalized(vector))
    ) {
      throw new SemanticServiceError("Invalid semantic embed response: identity, shape, or normalization mismatch.", "response");
    }
    return {
      vectors: vectors.map((vector) => new Float32Array(vector)),
      tokenCounts,
    };
  }

  async rerank(query: string, candidates: readonly { id: string; text: string }[]) {
    validateTexts([query], 1, "Reranking query");
    validateTexts(
      candidates.map((candidate) => candidate.text),
      10,
      "Reranking",
    );
    const requestedIds = candidates.map((candidate) => candidate.id);
    if (requestedIds.some((id) => !id.trim()) || new Set(requestedIds).size !== requestedIds.length) {
      throw new Error("Reranking candidate ids must be non-empty and unique.");
    }

    const raw = await this.post("/rerank", { query, candidates }, this.config.rerankTimeoutMs, "rerank");
    const parsed = RerankResponseSchema.safeParse(raw);
    if (!parsed.success) throw new SemanticServiceError("Invalid semantic rerank response: schema mismatch.", "response");
    const { model, scores } = parsed.data;
    const scoreById = new Map(scores.map((score) => [score.id, score.score]));
    if (
      model.id !== this.config.reranker.modelId ||
      model.revision !== this.config.reranker.modelRevision ||
      scoreById.size !== scores.length ||
      scoreById.size !== requestedIds.length ||
      requestedIds.some((id) => !scoreById.has(id))
    ) {
      throw new SemanticServiceError("Invalid semantic rerank response: identity or candidate mismatch.", "response");
    }
    return requestedIds.map((id) => ({ id, score: scoreById.get(id)! }));
  }
}

export function createSemanticSearchClient(env: Record<string, string | undefined> = process.env, fetchImpl: Fetch = fetch) {
  const config = readSemanticSearchConfig(env);
  return config ? new SemanticSearchClient(config, fetchImpl) : null;
}
