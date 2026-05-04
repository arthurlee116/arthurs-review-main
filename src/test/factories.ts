import type { ArticleInput } from "@/lib/services/articles";

export function articleInput(overrides: Partial<ArticleInput> = {}): ArticleInput {
  return {
    titleZh: "短评的锋利应该留一点余温",
    titleEn: null,
    slug: "short-note-with-warmth",
    category: "commentary",
    excerptZh: "一段短评摘要",
    excerptEn: null,
    seoDescription: "Arthur writes a short current-affairs note.",
    bodyZh: "中文正文",
    bodyEn: null,
    tagIds: [],
    coverImagePath: null,
    ...overrides,
  };
}
