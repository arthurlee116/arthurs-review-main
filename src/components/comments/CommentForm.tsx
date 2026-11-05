"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const BODY_MAX = 4000;

type Status = { kind: "idle" | "submitting" | "pending" | "error"; message?: string };

export function CommentForm({ articleId, locale, turnstileSiteKey }: { articleId: number; locale: Locale; turnstileSiteKey: string | null }) {
  const t = dictionary(locale);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [token, setToken] = useState("");
  const startedAt = useRef(0);
  const widgetHost = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    // Set after hydration so the timing check measures the reader, not the server render.
    startedAt.current = Date.now();
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  function renderWidget() {
    if (!turnstileSiteKey || !widgetHost.current || widgetId.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(widgetHost.current, {
      sitekey: turnstileSiteKey,
      language: locale === "zh" ? "zh-cn" : "en",
      callback: (value: string) => setToken(value),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus({ kind: "submitting" });
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          locale,
          authorName: data.get("authorName"),
          email: data.get("email"),
          body: data.get("body"),
          website: data.get("website"),
          startedAt: startedAt.current,
          turnstileToken: token,
        }),
      });
      if (response.ok) {
        form.reset();
        setStatus({ kind: "pending", message: t.commentPending });
      } else {
        const { error } = (await response.json().catch(() => ({}))) as { error?: string };
        const message =
          error === "rate_limited" ? t.commentErrorRate
          : error === "captcha" ? t.commentErrorCaptcha
          : error === "invalid_email" ? t.commentErrorEmail
          : t.commentErrorGeneric;
        setStatus({ kind: "error", message });
      }
    } catch {
      setStatus({ kind: "error", message: t.commentErrorGeneric });
    } finally {
      // Turnstile tokens are single-use.
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setToken("");
    }
  }

  const needsToken = Boolean(turnstileSiteKey) && !token;
  const inputClass = "w-full border-2 border-[var(--rule)] bg-white/70 p-3 text-base";

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4" aria-labelledby="comment-form-title">
      <h3 id="comment-form-title" className="text-lg font-black">
        {t.leaveComment}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>{t.commentName}</span>
          <input className={inputClass} name="authorName" maxLength={40} autoComplete="nickname" />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{t.commentEmail}</span>
          <input className={inputClass} name="email" type="email" maxLength={200} autoComplete="email" />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span>{t.commentBody}</span>
        <textarea className={`${inputClass} min-h-36 leading-7`} name="body" required maxLength={BODY_MAX} />
      </label>
      {/* Honeypot: hidden from people and assistive tech, irresistible to form-filling bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderWidget} />
          <div ref={widgetHost} className="min-h-[65px]" />
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status.kind === "submitting" || needsToken}
          className="border-2 border-[var(--rule)] bg-[var(--ink)] px-5 py-2 font-bold disabled:opacity-50"
          style={{ color: "var(--paper)" }}
        >
          {status.kind === "submitting" ? t.commentSubmitting : t.commentSubmit}
        </button>
        <p className={`text-sm font-bold ${status.kind === "error" ? "text-[var(--accent)]" : ""}`} role="status" aria-live="polite">
          {status.message ?? ""}
        </p>
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">{t.commentPrivacy}</p>
    </form>
  );
}
