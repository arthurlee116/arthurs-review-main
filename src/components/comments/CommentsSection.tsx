import { CommentForm } from "@/components/comments/CommentForm";
import type { PublicComment } from "@/lib/services/comments";
import { dictionary } from "@/lib/i18n/dictionary";
import { interpolate, languageTag, type Locale } from "@/lib/i18n/locale";

export function CommentsSection({
  articleId,
  comments,
  locale,
  turnstileSiteKey,
}: {
  articleId: number;
  comments: PublicComment[];
  locale: Locale;
  turnstileSiteKey: string | null;
}) {
  const t = dictionary(locale);
  const countLabel = interpolate(comments.length === 1 ? t.commentSingular : t.commentCount, { count: String(comments.length) });

  return (
    <section id="comments" lang={languageTag[locale]} aria-labelledby="comments-title" className="sans mt-12 border-t-2 border-[var(--rule)] pt-8">
      <h2 id="comments-title" className="text-2xl font-black md:text-3xl">
        {t.comments}
        <span className="ml-3 text-base font-normal text-[var(--muted)]">{countLabel}</span>
      </h2>
      {comments.length ? (
        <ol className="mt-6 grid gap-6">
          {comments.map((comment) => (
            <li key={comment.id} id={`comment-${comment.id}`} className="border-l-2 border-[var(--rule)] pl-4">
              <p className="text-sm">
                <span className="font-bold">{comment.authorName || t.anonymous}</span>
                <span className="mx-2 text-[var(--muted)]">·</span>
                <time className="text-[var(--muted)]" dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleDateString(languageTag[locale], { timeZone: "UTC" })}
                </time>
              </p>
              {/* Plain text only: React escapes it, and whitespace keeps the reader's paragraphs. */}
              <p className="mt-2 whitespace-pre-wrap break-words leading-7">{comment.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">{t.noComments}</p>
      )}
      <CommentForm articleId={articleId} locale={locale} turnstileSiteKey={turnstileSiteKey} />
    </section>
  );
}
