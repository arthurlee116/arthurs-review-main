import { languageTag, type Locale } from "@/lib/i18n/locale";
import { categoryLabel, type CategoryId } from "@/lib/content/categories";

export function ArticleMeta({ category, publishedAt, locale = "zh" }: { category: CategoryId; publishedAt: string | null; locale?: Locale }) {
  return (
    <p lang={languageTag[locale]} className="sans text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
      {categoryLabel(category, locale)}
      {publishedAt ? ` / ${new Date(publishedAt).toLocaleDateString(languageTag[locale], { timeZone: "UTC" })}` : ""}
    </p>
  );
}
