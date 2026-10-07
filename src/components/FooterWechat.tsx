"use client";

import { dictionary } from "@/lib/i18n/dictionary";
import { interpolate, type Locale } from "@/lib/i18n/locale";
import { useState } from "react";

const wechat = "bookspiano";

export function FooterWechat({ locale = "zh" }: { locale?: Locale }) {
  const t = dictionary(locale);
  const [status, setStatus] = useState("");

  async function copyWechat() {
    try {
      await navigator.clipboard.writeText(wechat);
      setStatus(t.copiedWechat);
    } catch {
      setStatus(interpolate(t.copyFailed, { id: wechat }));
    }
  }

  return (
    <div className="sans mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        aria-label={`${t.copyWechat} ${wechat}`}
        className="font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4 transition-colors hover:text-[var(--accent)] focus-visible:text-[var(--accent)] active:translate-y-px"
        onClick={copyWechat}
      >
        {t.wechat} {wechat}
      </button>
      <span className="text-xs font-bold text-[var(--muted)]" role={status ? "status" : undefined} aria-live="polite">
        {status}
      </span>
    </div>
  );
}
