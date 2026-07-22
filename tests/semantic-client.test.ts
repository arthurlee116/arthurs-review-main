import { describe, expect, it, vi } from "vitest";
import { SemanticSearchClient, readSemanticSearchConfig } from "@/lib/semantic/client";

const config = {
  baseUrl: "http://semantic:8090",
  embedding: {
    modelId: "ibm-granite/granite-embedding-97m-multilingual-r2",
    modelRevision: "embedding-revision",
    dimension: 3,
  },
  reranker: {
    modelId: "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
    modelRevision: "reranker-revision",
  },
  embedTimeoutMs: 50,
  rerankTimeoutMs: 70,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("semantic search configuration", () => {
  it("is disabled when no sidecar URL is configured", () => {
    expect(readSemanticSearchConfig({})).toBeNull();
  });

  it("requires pinned model identities when a sidecar is configured", () => {
    expect(() => readSemanticSearchConfig({ SEMANTIC_SEARCH_URL: "http://semantic:8090" })).toThrow("SEMANTIC_SEARCH_MODEL_ID");
  });

  it("parses a complete bounded configuration", () => {
    expect(
      readSemanticSearchConfig({
        SEMANTIC_SEARCH_URL: "http://semantic:8090/",
        SEMANTIC_SEARCH_MODEL_ID: config.embedding.modelId,
        SEMANTIC_SEARCH_MODEL_REVISION: config.embedding.modelRevision,
        SEMANTIC_SEARCH_DIMENSION: "3",
        SEMANTIC_RERANK_MODEL_ID: config.reranker.modelId,
        SEMANTIC_RERANK_MODEL_REVISION: config.reranker.modelRevision,
        SEMANTIC_SEARCH_TIMEOUT_MS: "50",
        SEMANTIC_RERANK_TIMEOUT_MS: "70",
      }),
    ).toEqual(config);
  });
});

describe("SemanticSearchClient", () => {
  it("embeds query text and validates the pinned identity, shape, and normalization", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        model: { id: config.embedding.modelId, revision: config.embedding.modelRevision, dimension: 3 },
        vectors: [[1, 0, 0]],
        tokenCounts: [4],
      }),
    );
    const client = new SemanticSearchClient(config, fetch);

    await expect(client.embed("query", ["人的价值是什么"])).resolves.toEqual({
      vectors: [new Float32Array([1, 0, 0])],
      tokenCounts: [4],
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://semantic:8090/embed",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "query", texts: ["人的价值是什么"] }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    ["wrong model", { model: { id: "wrong", revision: config.embedding.modelRevision, dimension: 3 }, vectors: [[1, 0, 0]], tokenCounts: [1] }],
    ["wrong revision", { model: { id: config.embedding.modelId, revision: "wrong", dimension: 3 }, vectors: [[1, 0, 0]], tokenCounts: [1] }],
    ["wrong dimension", { model: { id: config.embedding.modelId, revision: config.embedding.modelRevision, dimension: 2 }, vectors: [[1, 0]], tokenCounts: [1] }],
    ["wrong vector count", { model: { id: config.embedding.modelId, revision: config.embedding.modelRevision, dimension: 3 }, vectors: [], tokenCounts: [] }],
    ["not normalized", { model: { id: config.embedding.modelId, revision: config.embedding.modelRevision, dimension: 3 }, vectors: [[2, 0, 0]], tokenCounts: [1] }],
    ["invalid token count", { model: { id: config.embedding.modelId, revision: config.embedding.modelRevision, dimension: 3 }, vectors: [[1, 0, 0]], tokenCounts: [-1] }],
  ])("rejects an invalid embed response: %s", async (_label, body) => {
    const client = new SemanticSearchClient(config, vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(client.embed("document", ["passage"])).rejects.toThrow("Invalid semantic embed response");
  });

  it("rejects non-success and non-JSON responses without leaking their body", async () => {
    const client = new SemanticSearchClient(
      config,
      vi.fn().mockResolvedValue(new Response("internal article text", { status: 503, headers: { "content-type": "text/plain" } })),
    );

    await expect(client.embed("query", ["query"])).rejects.toThrow("Semantic service returned 503");
    await expect(client.embed("query", ["query"])).rejects.not.toThrow("internal article text");
  });

  it("aborts an embedding request at the configured timeout", async () => {
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    );
    const client = new SemanticSearchClient({ ...config, embedTimeoutMs: 5 }, fetch);

    await expect(client.embed("query", ["slow query"])).rejects.toThrow("timed out");
  });

  it("reranks by stable candidate id and returns finite logits in request order", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        model: { id: config.reranker.modelId, revision: config.reranker.modelRevision },
        scores: [
          { id: "article:2", score: 1.25 },
          { id: "article:1", score: -0.5 },
        ],
      }),
    );
    const client = new SemanticSearchClient(config, fetch);

    await expect(
      client.rerank("query", [
        { id: "article:1", text: "first" },
        { id: "article:2", text: "second" },
      ]),
    ).resolves.toEqual([
      { id: "article:1", score: -0.5 },
      { id: "article:2", score: 1.25 },
    ]);
  });

  it.each([
    ["unknown id", [{ id: "article:9", score: 1 }]],
    ["missing id", [{ id: "article:1", score: 1 }]],
    ["duplicate id", [{ id: "article:1", score: 1 }, { id: "article:1", score: 2 }]],
  ])("rejects invalid reranker scores: %s", async (_label, scores) => {
    const client = new SemanticSearchClient(
      config,
      vi.fn().mockResolvedValue(
        jsonResponse({ model: { id: config.reranker.modelId, revision: config.reranker.modelRevision }, scores }),
      ),
    );

    await expect(
      client.rerank("query", [
        { id: "article:1", text: "first" },
        { id: "article:2", text: "second" },
      ]),
    ).rejects.toThrow("Invalid semantic rerank response");
  });

  it("bounds input before making a request", async () => {
    const fetch = vi.fn();
    const client = new SemanticSearchClient(config, fetch);

    await expect(client.embed("query", [])).rejects.toThrow("at least one text");
    await expect(client.rerank("query", Array.from({ length: 11 }, (_, id) => ({ id: String(id), text: "passage" })))).rejects.toThrow("at most 10");
    expect(fetch).not.toHaveBeenCalled();
  });
});
