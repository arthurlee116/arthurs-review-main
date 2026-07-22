import { describe, expect, it } from "vitest";
import { applyRerankerScores, reciprocalRankFusion } from "@/lib/semantic/ranking";

describe("article-level reciprocal rank fusion", () => {
  it("uses one-based ranks, k=60, and the first occurrence of a duplicate article", () => {
    const fts = [
      { articleId: 1, publishedAt: "2026-07-20T00:00:00.000Z", source: "fts-one" },
      { articleId: 2, publishedAt: "2026-07-19T00:00:00.000Z", source: "fts-two" },
      { articleId: 1, publishedAt: "2026-07-20T00:00:00.000Z", source: "fts-duplicate" },
    ];
    const dense = [
      { articleId: 2, publishedAt: "2026-07-19T00:00:00.000Z", source: "dense-two" },
      { articleId: 3, publishedAt: "2026-07-21T00:00:00.000Z", source: "dense-three" },
    ];

    const fused = reciprocalRankFusion(fts, dense);

    expect(fused.map((candidate) => candidate.articleId)).toEqual([2, 1, 3]);
    expect(fused[0]).toMatchObject({ ftsRank: 2, denseRank: 1, fts: fts[1], dense: dense[0] });
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
    expect(fused[1]!.score).toBeCloseTo(1 / 61);
    expect(fused[2]!.score).toBeCloseTo(1 / 62);
  });

  it("breaks equal scores by source count, best rank, publication time, then id", () => {
    const publishedAt = "2026-07-20T00:00:00.000Z";
    const fts = [
      { articleId: 1, publishedAt, source: "one" },
      { articleId: 2, publishedAt: "2026-07-21T00:00:00.000Z", source: "two" },
      { articleId: 3, publishedAt, source: "three" },
      { articleId: 4, publishedAt, source: "four" },
    ];
    const dense = [
      { articleId: 4, publishedAt, source: "four-dense" },
      { articleId: 8, publishedAt, source: "eight" },
      { articleId: 7, publishedAt, source: "seven" },
      { articleId: 6, publishedAt, source: "six" },
    ];

    const fused = reciprocalRankFusion(fts, dense, 60);

    expect(fused[0]?.articleId).toBe(4);
    expect(fused.findIndex((candidate) => candidate.articleId === 2)).toBeLessThan(
      fused.findIndex((candidate) => candidate.articleId === 3),
    );
    expect(fused.findIndex((candidate) => candidate.articleId === 7)).toBeLessThan(
      fused.findIndex((candidate) => candidate.articleId === 3),
    );
  });

  it("rejects an invalid fusion constant", () => {
    expect(() => reciprocalRankFusion([], [], 0)).toThrow("positive");
  });
});

describe("reranker ordering", () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    articleId: index + 1,
    score: 1 / (61 + index),
    ftsRank: index + 1,
    denseRank: null,
    fts: { articleId: index + 1, publishedAt: null },
    dense: null,
  }));

  it("reorders only the first ten and keeps equal logits stable", () => {
    const scores = new Map<number, number>([
      [1, 0.1],
      [2, 0.9],
      [3, 0.9],
      [4, -1],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 0],
    ]);

    const reranked = applyRerankerScores(candidates, scores, 10);

    expect(reranked.slice(0, 4).map((candidate) => candidate.articleId)).toEqual([2, 3, 1, 5]);
    expect(reranked.slice(10).map((candidate) => candidate.articleId)).toEqual([11, 12]);
    expect(reranked[0]).toMatchObject({ articleId: 2, rerankerScore: 0.9 });
  });

  it("requires exactly one finite score for every reranked candidate", () => {
    expect(() => applyRerankerScores(candidates, new Map([[1, 1]]), 10)).toThrow("exactly one finite score");
    const scores = new Map(candidates.slice(0, 10).map((candidate) => [candidate.articleId, 0]));
    scores.set(4, Number.NaN);
    expect(() => applyRerankerScores(candidates, scores, 10)).toThrow("exactly one finite score");
  });
});
