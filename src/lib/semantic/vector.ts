import { Buffer } from "node:buffer";

export type SemanticModelIdentity = {
  modelId: string;
  modelRevision: string;
  dimension: number;
};

export type StoredEmbeddingChunk = SemanticModelIdentity & {
  articleId: number;
  chunkIndex: number;
  language: "metadata" | "zh" | "en";
  content: string;
  publishedAt: string | null;
  embedding: Buffer;
};

export type DenseArticleCandidate = {
  articleId: number;
  score: number;
  chunkIndex: number;
  language: StoredEmbeddingChunk["language"];
  content: string;
};

function assertPositiveDimension(dimension: number) {
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error("Vector dimension must be a positive integer.");
  }
}

function assertFiniteFloat32(value: number) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new Error("Vector values must be finite float32 numbers.");
  }
}

export function encodeFloat32Vector(values: readonly number[] | Float32Array) {
  if (values.length === 0) throw new Error("Vector must contain at least one dimension.");
  const encoded = Buffer.allocUnsafe(values.length * Float32Array.BYTES_PER_ELEMENT);
  values.forEach((value, index) => {
    assertFiniteFloat32(value);
    encoded.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
  });
  return encoded;
}

export function decodeFloat32Vector(blob: Uint8Array, dimension: number) {
  assertPositiveDimension(dimension);
  const expectedBytes = dimension * Float32Array.BYTES_PER_ELEMENT;
  if (blob.byteLength !== expectedBytes) {
    throw new Error(`Vector byte length must be ${expectedBytes}, received ${blob.byteLength}.`);
  }

  const buffer = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  const values = new Float32Array(dimension);
  for (let index = 0; index < dimension; index += 1) {
    const value = buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
    assertFiniteFloat32(value);
    values[index] = value;
  }
  return values;
}

export function dotProduct(left: Float32Array, right: Float32Array) {
  if (left.length === 0 || right.length === 0) throw new Error("Vectors must contain at least one dimension.");
  if (left.length !== right.length) throw new Error("Vectors must have the same dimension.");

  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      throw new Error("Vector values must be finite.");
    }
    score += leftValue * rightValue;
  }
  if (!Number.isFinite(score)) throw new Error("Dot product must be finite.");
  return score;
}

function identityMatches(row: SemanticModelIdentity, expected: SemanticModelIdentity) {
  return (
    row.modelId === expected.modelId &&
    row.modelRevision === expected.modelRevision &&
    row.dimension === expected.dimension
  );
}

function publishedTime(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function rankDenseArticleChunks(
  rows: readonly StoredEmbeddingChunk[],
  queryVector: Float32Array,
  identity: SemanticModelIdentity,
  limit: number,
) {
  assertPositiveDimension(identity.dimension);
  if (queryVector.length !== identity.dimension) throw new Error("Query vector dimension does not match the active model.");
  if (!Number.isInteger(limit) || limit < 0) throw new Error("Dense result limit must be a non-negative integer.");

  const bestByArticle = new Map<number, DenseArticleCandidate & { publishedAt: string | null }>();
  let skippedRows = 0;

  for (const row of rows) {
    if (!identityMatches(row, identity)) {
      skippedRows += 1;
      continue;
    }

    try {
      const score = dotProduct(queryVector, decodeFloat32Vector(row.embedding, identity.dimension));
      const existing = bestByArticle.get(row.articleId);
      if (!existing || score > existing.score || (score === existing.score && row.chunkIndex < existing.chunkIndex)) {
        bestByArticle.set(row.articleId, {
          articleId: row.articleId,
          score,
          chunkIndex: row.chunkIndex,
          language: row.language,
          content: row.content,
          publishedAt: row.publishedAt,
        });
      }
    } catch {
      skippedRows += 1;
    }
  }

  const candidates = [...bestByArticle.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        publishedTime(right.publishedAt) - publishedTime(left.publishedAt) ||
        right.articleId - left.articleId,
    )
    .slice(0, limit)
    .map(({ publishedAt: _publishedAt, ...candidate }) => candidate);

  return { candidates, skippedRows };
}
