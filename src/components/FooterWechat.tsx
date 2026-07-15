"use client";

import { useState } from "react";

const wechat = "bookspiano";

export function FooterWechat() {
  const [status, setStatus] = useState("");

  async function copyWechat() {
    try {
      await navigator.clipboard.writeText(wechat);
      setStatus("微信号已复制");
    } catch {
      setStatus(`复制失败，请手动复制 ${wechat}`);
    }
  }

  return (
    <div className="sans mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        aria-label={`复制微信号 ${wechat}`}
        className="font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4 transition-colors hover:text-[var(--accent)] focus-visible:text-[var(--accent)] active:translate-y-px"
        onClick={copyWechat}
      >
        微信 {wechat}
      </button>
      <span className="text-xs font-bold text-[var(--muted)]" role={status ? "status" : undefined} aria-live="polite">
        {status}
      </span>
    </div>
  );
}
