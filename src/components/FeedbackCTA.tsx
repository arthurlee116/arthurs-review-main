"use client";

import { useState } from "react";

const email = "laoliarthur@outlook.com";
const wechat = "bookspiano";

export function FeedbackCTA({ articleTitle }: { articleTitle: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const params = new URLSearchParams({
    subject: `关于《${articleTitle}》的反馈`,
    body: `Arthur 你好，\n\n我读了《${articleTitle}》。\n\n我赞同的是：\n\n我不同意或想补充的是：\n`,
  });

  async function copyWechat() {
    try {
      await navigator.clipboard.writeText(wechat);
      setCopyStatus("微信号已复制");
    } catch {
      setCopyStatus(`复制失败，请手动复制 ${wechat}`);
    }
  }

  return (
    <aside aria-labelledby="feedback-title" className="sans mt-12 border-y-2 border-[var(--rule)] bg-white/45 px-5 py-7 md:px-8">
      <div className="h-1.5 w-16 bg-[var(--accent)]" aria-hidden="true" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Reader feedback</p>
      <h2 id="feedback-title" className="mt-2 text-2xl font-black leading-tight md:text-3xl">
        读完了？来挑错。
      </h2>
      <p className="mt-3 leading-7">哪一段最站不住脚？有没有事实错误或我忽略的视角？你希望我接着写什么？</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a className="border-2 border-[var(--rule)] bg-[var(--ink)] px-4 py-2 font-bold" style={{ color: "var(--paper)" }} href={`mailto:${email}?${params}`}>
          邮件反馈
        </a>
        <button className="border-2 border-[var(--rule)] bg-transparent px-4 py-2 font-bold" type="button" onClick={copyWechat}>
          复制微信号
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">微信：{wechat}</p>
      <p className="mt-1 min-h-5 text-xs font-bold" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </aside>
  );
}
