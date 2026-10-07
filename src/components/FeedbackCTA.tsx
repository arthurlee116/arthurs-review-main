"use client";

import { dictionary } from "@/lib/i18n/dictionary";
import { interpolate, languageTag, type Locale } from "@/lib/i18n/locale";
import { useState } from "react";

const email = "laoliarthur@outlook.com";
const wechat = "bookspiano";

export function FeedbackCTA({ articleTitle, locale = "zh" }: { articleTitle: string; locale?: Locale }) {
  const t = dictionary(locale);
  const [copyStatus, setCopyStatus] = useState("");
  const params = new URLSearchParams({
    subject: interpolate(t.feedbackSubject, { title: articleTitle }),
    body: interpolate(t.feedbackBody, { title: articleTitle }),
  });

  async function copyWechat() {
    try {
      await navigator.clipboard.writeText(wechat);
      setCopyStatus(t.copiedWechat);
    } catch {
      setCopyStatus(interpolate(t.copyFailed, { id: wechat }));
    }
  }

  return (
    <aside lang={languageTag[locale]} aria-labelledby="feedback-title" className="sans mt-12 border-y-2 border-[var(--rule)] bg-white/45 px-5 py-7 md:px-8">
      <div className="h-1.5 w-16 bg-[var(--accent)]" aria-hidden="true" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{t.readerFeedback}</p>
      <h2 id="feedback-title" className="mt-2 text-2xl font-black leading-tight md:text-3xl">
        {t.feedbackHeading}
      </h2>
      <p className="mt-3 leading-7">{t.feedbackIntro}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a className="border-2 border-[var(--rule)] bg-[var(--ink)] px-4 py-2 font-bold" style={{ color: "var(--paper)" }} href={`mailto:${email}?${params}`}>
          {t.emailFeedback}
        </a>
        <button className="border-2 border-[var(--rule)] bg-transparent px-4 py-2 font-bold" type="button" onClick={copyWechat}>
          {t.copyWechat}
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">{t.wechat}: {wechat}</p>
      <p className="mt-1 min-h-5 text-xs font-bold" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </aside>
  );
}
