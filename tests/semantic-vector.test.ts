import { describe, expect, it } from "vitest";
import {
  decodeFloat32Vector,
  dotProduct,
  encodeFloat32Vector,
  rankDenseArticleChunks,
} from "@/lib/semantic/vector";

describe("semantic vector storage", () => {
  it("round-trips finite float32 values in explicit little-endian order", () => {
    const encoded = encodeFloat32Vector([1, -2.5, 0.25]);

    expect(encoded).toBeInstanceOf(Buffer);
    expect(encoded).toHaveLength(12);
    expect([...encoded.subarray(0, 4)]).toEqual([0, 0, 128, 63]);
    expect(Array.from(decodeFloat32Vector(encoded, 3))).toEqual([1, -2.5, 0.25]);
  });

  it("rejects empty, non-finite, overflowed, truncated, and dimension-mismatched vectors", () => {
    expect(() => encodeFloat32Vector([])).toThrow("at least one dimension");
    expect(() => encodeFloat32Vector([Number.NaN])).toThrow("finite float32");
    expect(() => encodeFloat32Vector([Number.POSITIVE_INFINITY])).toThrow("finite float32");
    expect(() => encodeFloat32Vector([Number.MAX_VALUE])).toThrow("finite float32");
    expect(() => decodeFloat32Vector(Buffer.alloc(3), 1)).toThrow("byte length");
    expect(() => decodeFloat32Vector(Buffer.alloc(8), 1)).toThrow("byte length");
    expect(() => decodeFloat32Vector(Buffer.alloc(4), 0)).toThrow("positive integer");

    const infinity = Buffer.alloc(4);
    infinity.writeFloatLE(Number.POSITIVE_INFINITY, 0);
    expect(() => decodeFloat32Vector(infinity, 1)).toThrow("finite float32");
  });

  it("computes a finite dot product and rejects incompatible inputs", () => {
    expect(dotProduct(new Float32Array([1, 0, 0]), new Float32Array([0.5, 0.5, 0]))).toBeCloseTo(0.5);
    expect(() => dotProduct(new Float32Array([1]), new Float32Array([1, 2]))).toThrow("same dimension");
    expect(() => dotProduct(new Float32Array(), new Float32Array())).toThrow("at least one dimension");
    expect(() => dotProduct(new Float32Array([Number.NaN]), new Float32Array([1]))).toThrow("finite");
  });
});

describe("dense article ranking", () => {
  const identity = {
    modelId: "ibm-granite/granite-embedding-97m-multilingual-r2",
    modelRevision: "fixed-revision",
    dimension: 3,
  };

  it("keeps only the best chunk per article before applying the article limit", () => {
    const rows = [
      {
        articleId: 1,
        chunkIndex: 0,
        language: "metadata" as const,
        content: "first weaker chunk",
        publishedAt: "2026-07-20T00:00:00.000Z",
        ...identity,
        embedding: encodeFloat32Vector([0.5, 0.5, 0]),
      },
      {
        articleId: 1,
        chunkIndex: 1,
        language: "zh" as const,
        content: "first best chunk",
        publishedAt: "2026-07-20T00:00:00.000Z",
        ...identity,
        embedding: encodeFloat32Vector([0.9, 0.1, 0]),
      },
      {
        articleId: 2,
        chunkIndex: 0,
        language: "zh" as const,
        content: "second article",
        publishedAt: "2026-07-21T00:00:00.000Z",
        ...identity,
        embedding: encodeFloat32Vector([0.8, 0.2, 0]),
      },
    ];

    expect(rankDenseArticleChunks(rows, new Float32Array([1, 0, 0]), identity, 2)).toEqual({
      candidates: [
        { articleId: 1, score: expect.closeTo(0.9, 5), chunkIndex: 1, language: "zh", content: "first best chunk" },
        { articleId: 2, score: expect.closeTo(0.8, 5), chunkIndex: 0, language: "zh", content: "second article" },
      ],
      skippedRows: 0,
    });
  });

  it("filters wrong identities and corrupt rows, then uses deterministic ties", () => {
    const rows = [
      {
        articleId: 1,
        chunkIndex: 2,
        language: "zh" as const,
        content: "older tie",
        publishedAt: "2026-07-20T00:00:00.000Z",
        ...identity,
        embedding: encodeFloat32Vector([1, 0, 0]),
      },
      {
        articleId: 2,
        chunkIndex: 3,
        language: "en" as const,
        content: "newer tie",
        publishedAt: "2026-07-21T00:00:00.000Z",
        ...identity,
        embedding: encodeFloat32Vector([1, 0, 0]),
      },
      {
        articleId: 3,
        chunkIndex: 0,
        language: "zh" as const,
        content: "wrong model",
        publishedAt: null,
        ...identity,
        modelRevision: "other-revision",
        embedding: encodeFloat32Vector([1, 0, 0]),
      },
      {
        articleId: 4,
        chunkIndex: 0,
        language: "zh" as const,
        content: "corrupt blob",
        publishedAt: null,
        ...identity,
        embedding: Buffer.alloc(4),
      },
    ];

    expect(rankDenseArticleChunks(rows, new Float32Array([1, 0, 0]), identity, 30)).toEqual({
      candidates: [
        { articleId: 2, score: 1, chunkIndex: 3, language: "en", content: "newer tie" },
        { articleId: 1, score: 1, chunkIndex: 2, language: "zh", content: "older tie" },
      ],
      skippedRows: 2,
    });
  });

  it("prefers the lower chunk index when one article has equal chunk scores", () => {
    const rows = [3, 1].map((chunkIndex) => ({
      articleId: 8,
      chunkIndex,
      language: "zh" as const,
      content: `chunk ${chunkIndex}`,
      publishedAt: null,
      ...identity,
      embedding: encodeFloat32Vector([1, 0, 0]),
    }));

    expect(rankDenseArticleChunks(rows, new Float32Array([1, 0, 0]), identity, 30).candidates[0]).toMatchObject({
      articleId: 8,
      chunkIndex: 1,
      content: "chunk 1",
    });
  });
});
