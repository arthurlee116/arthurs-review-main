import { getArticleById, listPublishedArticles } from "./articles";

export function searchArticles(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return listPublishedArticles().filter((summary) => {
    const article = getArticleById(summary.id, { includeDraft: false }) ?? summary;
    const text = [
      article.titleZh,
      article.titleEn,
      article.excerptZh,
      article.excerptEn,
      article.category,
      article.bodyZh,
      article.bodyEn,
      article.tags.map((tag) => tag.name).join(" "),
      article.tags.map((tag) => tag.slug).join(" "),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return text.includes(normalized);
  });
}
