export type ArticleEmbeddingInput = {
  titleZh: string;
  excerptZh: string;
  category: string;
  tags: readonly string[];
  bodyZh: string;
};

export type ArticleEmbeddingChunk = {
  chunkIndex: number;
  language: "metadata" | "zh";
  content: string;
  embeddingText: string;
};

export type ChunkingOptions = {
  targetCodePoints?: number;
  maxCodePoints?: number;
  overlapCodePoints?: number;
};

type ResolvedChunkingOptions = Required<ChunkingOptions>;
type MarkdownSection = { heading: string | null; content: string };

const defaultChunkingOptions: ResolvedChunkingOptions = {
  targetCodePoints: 400,
  maxCodePoints: 520,
  overlapCodePoints: 60,
};

function resolveOptions(options: ChunkingOptions): ResolvedChunkingOptions {
  const resolved = { ...defaultChunkingOptions, ...options };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  }
  if (resolved.targetCodePoints > resolved.maxCodePoints) {
    throw new Error("targetCodePoints must not exceed maxCodePoints.");
  }
  if (resolved.overlapCodePoints >= resolved.targetCodePoints) {
    throw new Error("overlapCodePoints must be smaller than targetCodePoints.");
  }
  return resolved;
}

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*~]/g, "")
    .replace(/(^|[^\p{L}\p{N}])_+/gu, "$1")
    .replace(/_+($|[^\p{L}\p{N}])/gu, "$1")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function cleanMarkdownForEmbedding(markdown: string) {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, " ").replace(/\r\n?/g, "\n");
  const lines = withoutComments.split("\n").map((rawLine) => {
    if (/^\s*(```|~~~)/.test(rawLine)) return "";
    const line = rawLine
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
      .replace(/^\s*\|?|\|?\s*$/g, "")
      .replace(/\s*\|\s*/g, " ");
    return cleanInlineMarkdown(line);
  });

  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const paragraph = current.join(" ").replace(/\s+/g, " ").trim();
    if (paragraph && !/^:?-{3,}:?$/.test(paragraph)) paragraphs.push(paragraph);
    current = [];
  };
  for (const line of lines) {
    if (!line) flush();
    else current.push(line);
  }
  flush();
  return paragraphs.join("\n\n");
}

function markdownSections(markdown: string): MarkdownSection[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const sections: MarkdownSection[] = [];
  let heading: string | null = null;
  let lines: string[] = [];

  const flush = () => {
    const content = cleanMarkdownForEmbedding(lines.join("\n"));
    if (content) sections.push({ heading, content });
    lines = [];
  };

  for (const line of normalized.split("\n")) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) {
      lines.push(line);
      continue;
    }
    flush();
    heading = cleanInlineMarkdown(match[1] ?? "") || null;
  }
  flush();

  if (sections.length === 0) {
    const content = cleanMarkdownForEmbedding(markdown);
    if (content) sections.push({ heading: null, content });
  }
  return sections;
}

function preferredEnd(points: string[], start: number, target: number, max: number) {
  const remaining = points.length - start;
  if (remaining <= max) return points.length;

  const targetEnd = Math.min(points.length, start + target);
  const earliestBoundary = start + Math.floor(target * 0.65);
  for (let index = targetEnd; index >= earliestBoundary; index -= 1) {
    if (/[。！？!?；;\n]/u.test(points[index - 1] ?? "")) return index;
  }
  return targetEnd;
}

function splitSection(section: MarkdownSection, options: ResolvedChunkingOptions) {
  const points = Array.from(section.content);
  const chunks: MarkdownSection[] = [];
  let start = 0;

  while (start < points.length) {
    const end = preferredEnd(points, start, options.targetCodePoints, options.maxCodePoints);
    const content = points.slice(start, end).join("").trim();
    if (content) chunks.push({ heading: section.heading, content });
    if (end >= points.length) break;
    start = Math.max(start + 1, end - options.overlapCodePoints);
  }
  return chunks;
}

function metadataContent(article: ArticleEmbeddingInput) {
  return [
    `中文标题：${article.titleZh.trim()}`,
    `中文摘要：${article.excerptZh.trim()}`,
    `分类：${article.category.trim()}`,
    article.tags.length > 0 ? `标签：${article.tags.map((tag) => tag.trim()).filter(Boolean).join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildArticleEmbeddingChunks(article: ArticleEmbeddingInput, options: ChunkingOptions = {}) {
  const resolved = resolveOptions(options);
  const chunks: ArticleEmbeddingChunk[] = [];
  const metadata = metadataContent(article);
  if (metadata) chunks.push({ chunkIndex: 0, language: "metadata", content: metadata, embeddingText: metadata });

  const appendBody = (markdown: string) => {
    if (!markdown.trim()) return;
    const titlePrefix = `文章：${article.titleZh.trim()}`;
    for (const section of markdownSections(markdown).flatMap((value) => splitSection(value, resolved))) {
      const headingPrefix = section.heading ? `章节：${section.heading}` : "";
      chunks.push({
        chunkIndex: chunks.length,
        language: "zh",
        content: section.content,
        embeddingText: [titlePrefix, headingPrefix, section.content].filter(Boolean).join("\n"),
      });
    }
  };

  appendBody(article.bodyZh);
  return chunks;
}
