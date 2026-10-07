"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfToken } from "@/lib/client/csrf";

export function FeaturedArticleButton({ articleId, title, isFeatured }: { articleId: number; title: string; isFeatured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function setFeatured() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/studio/api/articles/${articleId}/featured`, {
        method: isFeatured ? "DELETE" : "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ text: body?.error ?? "推荐更新失败", error: true });
        return;
      }
      setMessage({ text: isFeatured ? "已取消推荐" : "已设为推荐", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "推荐更新失败", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        className="whitespace-nowrap border border-[var(--rule)] px-3 py-1.5 text-xs font-bold"
        aria-label={`${isFeatured ? "取消推荐" : "设为推荐"}：${title}`}
        disabled={pending}
        onClick={setFeatured}
      >
        {pending ? "更新中…" : isFeatured ? "取消推荐" : "设为推荐"}
      </button>
      {message ? (
        <span className={message.error ? "text-xs font-bold text-[var(--accent)]" : "sr-only"} role="status" aria-live="polite">
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
