import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregateRetrievalMetrics,
  retrievalMetrics,
  summarizeLatencyMs,
  validateBenchmarkDataset,
} from "@/lib/semantic/benchmark";

const knownSlugs = [
  "what-about-stereotypes",
  "poem-for-korchagin",
  "a-poem-for-someone",
  "banned-by-the-internationale",
  "flaws-of-our-language",
  "how-much-do-your-effort-count",
  "what-about-the-iranian-war",
  "dont-give-everything-to-morals",
  "relc-from-textbook",
  "blur-big-word",
  "talk-but-vaguely",
  "romance-vs-capital",
  "win-in-your-life-with-a-good-heart",
  "thanks-to-academia",
  "hidden-unsaid-everywhere",
  "limitations-on-ai-doubted",
  "i-love-soviet-music",
  "gooooodddds-not-valid",
  "0625-thought-about-agentic-ai",
  "family-and-parents",
  "memory-system-of-codex-breaked-down",
  "why-nations-fail-perdictable",
  "bad-teens-gone-bad",
  "no-logic-in-social-science",
  "future-of-proletarians-in-ai-era",
  "lets-welcome-kant",
  "once-again-on-the-value-of-us",
];

describe("semantic-search benchmark", () => {
  it("contains exactly 270 unique, quota-balanced questions over every published article", () => {
    const raw = JSON.parse(fs.readFileSync("benchmarks/semantic-search/questions.json", "utf8"));
    const dataset = validateBenchmarkDataset(raw, knownSlugs);

    expect(dataset.questions).toHaveLength(270);
    expect(new Set(dataset.questions.map((question) => question.id))).toHaveLength(270);
    expect(new Set(dataset.questions.map((question) => question.query.trim().toLocaleLowerCase()))).toHaveLength(270);
    expect(new Set(dataset.questions.map((question) => question.primarySlug))).toEqual(new Set(knownSlugs));

    for (const slug of knownSlugs) {
      const questions = dataset.questions.filter((question) => question.primarySlug === slug);
      expect(questions.filter((question) => question.kind === "lexical")).toHaveLength(2);
      expect(questions.filter((question) => question.kind === "semantic")).toHaveLength(5);
      expect(questions.filter((question) => question.kind === "contrastive")).toHaveLength(2);
      expect(questions.filter((question) => question.kind === "cross_lingual")).toHaveLength(1);
      expect(questions.filter((question) => question.split === "dev")).toHaveLength(7);
      expect(questions.filter((question) => question.split === "held_out")).toHaveLength(3);
    }
  });

  it("rejects an unknown relevant slug or duplicated query", () => {
    const raw = JSON.parse(fs.readFileSync("benchmarks/semantic-search/questions.json", "utf8"));
    raw.questions[0].relevantSlugs = [raw.questions[0].primarySlug, "missing"];
    raw.questions[1].query = raw.questions[2].query;

    expect(() => validateBenchmarkDataset(raw, knownSlugs)).toThrow(/unknown slug|duplicate query/i);
  });

  it("calculates binary Hit@k, MRR@10, and nDCG@10 exactly", () => {
    expect(retrievalMetrics(["wrong", "primary", "also"], ["primary", "also"])).toEqual({
      hitAt1: 0,
      hitAt3: 1,
      hitAt10: 1,
      reciprocalRankAt10: 0.5,
      ndcgAt10: (1 / Math.log2(3) + 1 / Math.log2(4)) / (1 + 1 / Math.log2(3)),
    });
    expect(retrievalMetrics(["wrong"], ["primary"])).toEqual({
      hitAt1: 0,
      hitAt3: 0,
      hitAt10: 0,
      reciprocalRankAt10: 0,
      ndcgAt10: 0,
    });
  });

  it("aggregates metrics without rounding away evidence", () => {
    const summary = aggregateRetrievalMetrics([
      { rankedSlugs: ["a", "x"], relevantSlugs: ["a"] },
      { rankedSlugs: ["x", "b"], relevantSlugs: ["b"] },
    ]);

    expect(summary.count).toBe(2);
    expect(summary.hitAt1).toBe(0.5);
    expect(summary.hitAt3).toBe(1);
    expect(summary.mrrAt10).toBe(0.75);
  });

  it("reports nearest-rank p50 and p95 latency without hiding the maximum", () => {
    expect(summarizeLatencyMs(Array.from({ length: 20 }, (_, index) => index + 1))).toEqual({
      mean: 10.5,
      p50: 10,
      p95: 19,
      max: 20,
    });
    expect(() => summarizeLatencyMs([])).toThrow("empty latency");
  });
});
