import { describe, expect, it } from "vitest";
import { buildArticleEmbeddingChunks, cleanMarkdownForEmbedding } from "@/lib/semantic/chunking";

describe("semantic Markdown cleaning", () => {
  it("keeps authored meaning and code while removing Markdown, HTML, and destination URLs", () => {
    const markdown = `# 制度与人\n\n> **权力**不会因为[名字](https://example.com/path)改变。\n\n- 第一项\n- 第二项\n\n\`inline_call()\`\n\n\`\`\`ts\nconst answer = 42;\n\`\`\`\n\n<img src="https://tracker.example/pixel" alt="secret">`;

    const cleaned = cleanMarkdownForEmbedding(markdown);

    expect(cleaned).toContain("制度与人");
    expect(cleaned).toContain("权力不会因为名字改变");
    expect(cleaned).toContain("第一项");
    expect(cleaned).toContain("inline_call()");
    expect(cleaned).toContain("const answer = 42;");
    expect(cleaned).not.toContain("https://");
    expect(cleaned).not.toMatch(/<img|\*\*|```|^#/m);
  });
});

describe("article embedding chunks", () => {
  const article = {
    titleZh: "价值不是价格",
    titleEn: "Value Is Not Price",
    excerptZh: "讨论资本主义如何把人的价值压缩成交换价格。",
    excerptEn: "Why market price cannot exhaust human value.",
    category: "society",
    tags: ["资本", "价值"],
    bodyZh: `## 市场\n\n${"价格不能定义人。".repeat(24)}\n\n## 尊严\n\n${"人应当作为目的。".repeat(18)}`,
    bodyEn: "## Dignity\n\nA person is an end, not merely a price.",
  };

  it("creates one metadata chunk followed by bounded Chinese and English body chunks", () => {
    const chunks = buildArticleEmbeddingChunks(article, {
      targetCodePoints: 80,
      maxCodePoints: 100,
      overlapCodePoints: 16,
    });

    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      language: "metadata",
    });
    expect(chunks[0]?.content).toContain("价值不是价格");
    expect(chunks[0]?.content).toContain("Value Is Not Price");
    expect(chunks[0]?.content).toContain("资本、价值");
    expect(chunks.some((chunk) => chunk.language === "zh")).toBe(true);
    expect(chunks.some((chunk) => chunk.language === "en")).toBe(true);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));
    expect(chunks.slice(1).every((chunk) => Array.from(chunk.content).length <= 100)).toBe(true);
    expect(chunks.filter((chunk) => chunk.language === "zh").every((chunk) => chunk.embeddingText.startsWith("文章：价值不是价格"))).toBe(true);
    expect(chunks.filter((chunk) => chunk.language === "en").every((chunk) => chunk.embeddingText.startsWith("Article: Value Is Not Price"))).toBe(true);
  });

  it("preserves overlap across a long paragraph and carries the nearest section heading", () => {
    const chunks = buildArticleEmbeddingChunks(article, {
      targetCodePoints: 80,
      maxCodePoints: 100,
      overlapCodePoints: 16,
    }).filter((chunk) => chunk.language === "zh");

    expect(chunks.length).toBeGreaterThan(2);
    const firstBody = Array.from(chunks[0]!.content);
    const secondBody = Array.from(chunks[1]!.content);
    expect(secondBody.slice(0, 16).join("")).toBe(firstBody.slice(-16).join(""));
    expect(chunks[0]?.embeddingText).toContain("章节：市场");
    expect(chunks.at(-1)?.embeddingText).toContain("章节：尊严");
  });

  it("omits empty body languages, never emits blank chunks, and is deterministic", () => {
    const chineseOnly = { ...article, titleEn: null, excerptEn: null, bodyEn: null, bodyZh: "短正文" };
    const first = buildArticleEmbeddingChunks(chineseOnly);
    const second = buildArticleEmbeddingChunks(chineseOnly);

    expect(first).toEqual(second);
    expect(first.some((chunk) => chunk.language === "en")).toBe(false);
    expect(first.every((chunk) => chunk.content.trim().length > 0 && chunk.embeddingText.trim().length > 0)).toBe(true);
  });

  it("rejects nonsensical chunk bounds", () => {
    expect(() =>
      buildArticleEmbeddingChunks(article, {
        targetCodePoints: 100,
        maxCodePoints: 80,
        overlapCodePoints: 10,
      }),
    ).toThrow("targetCodePoints");
    expect(() =>
      buildArticleEmbeddingChunks(article, {
        targetCodePoints: 80,
        maxCodePoints: 100,
        overlapCodePoints: 80,
      }),
    ).toThrow("overlapCodePoints");
  });
});
