import { parseLifeBody } from "@/lib/content/life-body";
import type { Article } from "@/lib/services/articles";

export function LifeArticleView({ article }: { article: Article }) {
  const { media, caption } = parseLifeBody(article.bodyZh ?? "");
  const date = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("zh-CN") : null;

  return (
    <article className="container pb-12 pt-8">
      <p className="sans text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{date}</p>
      <h1 className="mt-2 text-4xl font-bold">{article.titleZh}</h1>

      {media.length ? (
        <section className="mt-8 columns-1 gap-4 md:columns-2 lg:columns-3">
          {media.map((item) =>
            item.isVideo ? (
              <video
                key={item.url}
                className="mb-4 w-full break-inside-avoid"
                controls
                preload="metadata"
                poster={item.poster}
              >
                <source src={item.url} type="video/mp4" />
              </video>
            ) : (
              <img key={item.url} src={item.url} alt="" loading="lazy" className="mb-4 w-full break-inside-avoid" />
            ),
          )}
        </section>
      ) : null}

      {caption.length ? (
        <div className="mt-8 grid max-w-prose gap-4 leading-relaxed">
          {caption.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
