import Link from "next/link";
import { articlePath } from "@/lib/content/urls";
import { uploadPublicPath } from "@/lib/media/paths";
import type { Article } from "@/lib/services/articles";

export function PhotoWall({ articles }: { articles: Article[] }) {
  return (
    <section className="columns-2 gap-4 md:columns-3">
      {articles.map((article) => {
        const href = articlePath(article.category, article.slug);
        const date = article.publishedAt
          ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
          : null;

        if (!article.coverImagePath) {
          return (
            <Link
              key={article.id}
              href={href}
              className="group mb-4 block break-inside-avoid border border-[var(--rule)] p-4"
            >
              <h2 className="font-bold leading-snug">{article.titleZh}</h2>
              {date ? (
                <p className="sans mt-2 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{date}</p>
              ) : null}
              {article.excerptZh ? (
                <p className="mt-3 text-sm text-[var(--muted)]">{article.excerptZh}</p>
              ) : null}
            </Link>
          );
        }

        return (
          <Link key={article.id} href={href} className="group relative mb-4 block break-inside-avoid">
            <img
              src={uploadPublicPath(article.coverImagePath)}
              alt=""
              loading="lazy"
              className="w-full"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
              <span className="block font-bold leading-snug text-white">{article.titleZh}</span>
              {date ? (
                <span className="sans mt-1 block text-xs uppercase tracking-[0.12em] text-white/80">{date}</span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
