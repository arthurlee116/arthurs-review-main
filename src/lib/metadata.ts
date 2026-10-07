import type { Metadata } from "next";
import { categoryLabel, type CategoryId } from "@/lib/content/categories";
import { articlePath } from "@/lib/content/urls";
import { uploadPublicPath } from "@/lib/media/paths";
import type { Article } from "@/lib/services/articles";
import { absoluteUrl } from "@/lib/seo";
import { localizedPath, interpolate, type Locale } from "@/lib/i18n/locale";
import { dictionary } from "@/lib/i18n/dictionary";
import { articleDisplay, hasEnglishArticle } from "@/lib/i18n/article";

const siteName = "Arthur's Review";
export function socialImageUrl(title: string, kicker = siteName) {
  return absoluteUrl(`/og?${new URLSearchParams({ title, kicker })}`);
}
export function publicPageMetadata({ title, description, path, imagePath, kicker, type = "website", locale = "zh", canonicalLocale = locale, hasEnglish = true }: {
  title: string; description?: string; path: string; imagePath?: string | null; kicker?: string; type?: "website" | "article"; locale?: Locale; canonicalLocale?: Locale; hasEnglish?: boolean;
}): Metadata {
  const url = absoluteUrl(localizedPath(path, canonicalLocale));
  const image = imagePath ? absoluteUrl(uploadPublicPath(imagePath)) : socialImageUrl(title, kicker);
  const text = description || dictionary(locale).siteDescription;
  return { title, description: text,
    alternates: { canonical: url, languages: { "zh-CN": absoluteUrl(localizedPath(path, "zh")), ...(hasEnglish ? { en: absoluteUrl(localizedPath(path, "en")) } : {}) }, types: { "application/rss+xml": absoluteUrl(localizedPath("/feed.xml", locale)) } },
    openGraph: { title, description: text, url, siteName, type, locale: canonicalLocale === "zh" ? "zh_CN" : "en_GB", images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, description: text, images: [{ url: image, alt: title }] },
  };
}
export function articleMetadata(article: Article, lang?: string): Metadata {
  const locale = lang === "en" ? "en" : "zh";
  const display = articleDisplay(article, locale);
  return publicPageMetadata({ title: display.title, description: display.locale === "zh" ? article.seoDescription || display.excerpt : display.excerpt, path: articlePath(article.category, article.slug), imagePath: article.coverImagePath, kicker: categoryLabel(article.category, locale), type: "article", locale, canonicalLocale: display.locale, hasEnglish: hasEnglishArticle(article) });
}
export function categoryMetadata(category: CategoryId, _label?: string, locale: Locale = "zh"): Metadata {
  const label = categoryLabel(category, locale);
  return publicPageMetadata({ title: label, description: interpolate(dictionary(locale).categoryDescription, { category: label }), path: `/${category}`, locale });
}
