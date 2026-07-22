export type RankedArticleSource = {
  articleId: number;
  publishedAt: string | null;
};

export type FusedArticleCandidate<Fts extends RankedArticleSource, Dense extends RankedArticleSource> = {
  articleId: number;
  score: number;
  ftsRank: number | null;
  denseRank: number | null;
  fts: Fts | null;
  dense: Dense | null;
};

function publicationTimestamp(candidate: { fts: RankedArticleSource | null; dense: RankedArticleSource | null }) {
  const raw = candidate.fts?.publishedAt ?? candidate.dense?.publishedAt;
  if (!raw) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function reciprocalRankFusion<Fts extends RankedArticleSource, Dense extends RankedArticleSource>(
  ftsRanking: readonly Fts[],
  denseRanking: readonly Dense[],
  k = 60,
) {
  if (!Number.isFinite(k) || k <= 0) throw new Error("RRF k must be positive.");
  const fused = new Map<number, FusedArticleCandidate<Fts, Dense>>();

  const add = (source: "fts" | "dense", ranking: readonly (Fts | Dense)[]) => {
    const seen = new Set<number>();
    ranking.forEach((candidate, index) => {
      if (seen.has(candidate.articleId)) return;
      seen.add(candidate.articleId);
      const rank = index + 1;
      const existing = fused.get(candidate.articleId) ?? {
        articleId: candidate.articleId,
        score: 0,
        ftsRank: null,
        denseRank: null,
        fts: null,
        dense: null,
      };
      existing.score += 1 / (k + rank);
      if (source === "fts") {
        existing.ftsRank = rank;
        existing.fts = candidate as Fts;
      } else {
        existing.denseRank = rank;
        existing.dense = candidate as Dense;
      }
      fused.set(candidate.articleId, existing);
    });
  };

  add("fts", ftsRanking);
  add("dense", denseRanking);

  return [...fused.values()].sort((left, right) => {
    const scoreDifference = right.score - left.score;
    if (scoreDifference !== 0) return scoreDifference;
    const leftSources = Number(left.ftsRank !== null) + Number(left.denseRank !== null);
    const rightSources = Number(right.ftsRank !== null) + Number(right.denseRank !== null);
    if (leftSources !== rightSources) return rightSources - leftSources;
    const leftBestRank = Math.min(left.ftsRank ?? Number.POSITIVE_INFINITY, left.denseRank ?? Number.POSITIVE_INFINITY);
    const rightBestRank = Math.min(right.ftsRank ?? Number.POSITIVE_INFINITY, right.denseRank ?? Number.POSITIVE_INFINITY);
    if (leftBestRank !== rightBestRank) return leftBestRank - rightBestRank;
    const publicationDifference = publicationTimestamp(right) - publicationTimestamp(left);
    if (publicationDifference !== 0) return publicationDifference;
    return right.articleId - left.articleId;
  });
}

export function applyRerankerScores<Candidate extends { articleId: number }>(
  candidates: readonly Candidate[],
  scores: ReadonlyMap<number, number>,
  limit = 10,
) {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("Reranker limit must be a non-negative integer.");
  const rerankedCount = Math.min(limit, candidates.length);
  const head = candidates.slice(0, rerankedCount);
  if (
    scores.size !== rerankedCount ||
    head.some((candidate) => !scores.has(candidate.articleId) || !Number.isFinite(scores.get(candidate.articleId)))
  ) {
    throw new Error("Reranker must return exactly one finite score for every reranked candidate.");
  }

  const reranked = head
    .map((candidate, originalIndex) => ({
      ...candidate,
      rerankerScore: scores.get(candidate.articleId)!,
      originalIndex,
    }))
    .sort((left, right) => right.rerankerScore - left.rerankerScore || left.originalIndex - right.originalIndex)
    .map(({ originalIndex: _originalIndex, ...candidate }) => candidate);
  return [...reranked, ...candidates.slice(rerankedCount)];
}
