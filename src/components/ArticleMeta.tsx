import { categoryLabel, type CategoryId } from "@/lib/content/categories";

export function ArticleMeta({ category, publishedAt }: { category: CategoryId; publishedAt: string | null }) {
  return (
    <p className="sans text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
      {categoryLabel(category)}
      {publishedAt ? ` / ${new Date(publishedAt).toLocaleDateString("zh-CN")}` : ""}
    </p>
  );
}
