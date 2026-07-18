"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfToken } from "@/lib/client/csrf";

export function FeaturedArticleButton({ articleId, title }: { articleId: number; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function setFeatured() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/studio/api/articles/${articleId}/featured`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ text: body?.error ?? "Could not update featured article", error: true });
        return;
      }
      setMessage({ text: "Featured article updated", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Could not update featured article", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        className="whitespace-nowrap border border-[var(--rule)] px-3 py-1.5 text-xs font-bold"
        aria-label={`Set ${title} as featured article`}
        disabled={pending}
        onClick={setFeatured}
      >
        {pending ? "Setting..." : "Set featured"}
      </button>
      {message ? (
        <span className={message.error ? "text-xs font-bold text-[var(--accent)]" : "sr-only"} role="status" aria-live="polite">
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
