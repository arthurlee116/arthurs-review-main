import { readMarkdownBody } from "@/lib/content/markdown";
import type { Article } from "@/lib/services/articles";
import type { Locale } from "./locale";

export function hasEnglishArticle(article: Pick<Article, "titleEn" | "bodyEn" | "bodyEnPath">) {
  if (!article.titleEn?.trim()) return false;
  if (article.bodyEn !== undefined) return Boolean(article.bodyEn?.trim());
  if (!article.bodyEnPath) return false;
  try { return Boolean(readMarkdownBody(article.bodyEnPath).trim()); } catch { return false; }
}

export function plainExcerpt(markdown: string, limit = 240) {
  return Array.from(markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]*>/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_`~>]/g, "").replace(/\s+/g, " ").trim()).slice(0, limit).join("");
}

export function articleDisplay(article: Article, locale: Locale) {
  const english = locale === "en" && hasEnglishArticle(article);
  const body = english ? article.bodyEn : article.bodyZh;
  let excerpt = english ? article.excerptEn?.trim() : article.excerptZh;
  if (english && !excerpt) {
    const markdown = body ?? (article.bodyEnPath ? readMarkdownBody(article.bodyEnPath) : "");
    excerpt = plainExcerpt(markdown);
  }
  return {
    locale: english ? "en" as const : "zh" as const,
    title: english ? article.titleEn! : article.titleZh,
    excerpt: excerpt ?? "",
    body: body ?? "",
  };
}
