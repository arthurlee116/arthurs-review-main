"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { csrfToken } from "@/lib/client/csrf";
import type { CommentStatus, StudioComment } from "@/lib/services/comments";

type Action = { label: string; status?: CommentStatus; destructive?: boolean };

// Each tab offers the moves that make sense from there; Delete is permanent and confirms first.
const actionsByStatus: Record<CommentStatus, Action[]> = {
  pending: [{ label: "通过", status: "approved" }, { label: "拒绝", status: "rejected" }, { label: "删除", destructive: true }],
  approved: [{ label: "撤回到待审核", status: "pending" }, { label: "拒绝", status: "rejected" }, { label: "删除", destructive: true }],
  rejected: [{ label: "通过", status: "approved" }, { label: "删除", destructive: true }],
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function CommentModerationList({ status, initialComments }: { status: CommentStatus; initialComments: StudioComment[] }) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function act(comment: StudioComment, action: Action) {
    if (action.destructive && !window.confirm("永久删除这条评论？无法恢复。")) return;
    setBusyId(comment.id);
    setError("");
    const response = await fetch(`/studio/api/comments/${comment.id}`, {
      method: action.destructive ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() ?? "" },
      body: action.destructive ? undefined : JSON.stringify({ status: action.status }),
    }).catch(() => null);
    setBusyId(null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "操作失败，请重试。");
      return;
    }
    setComments((current) => current.filter((item) => item.id !== comment.id));
    // Refresh the server-rendered tab counts.
    router.refresh();
  }

  if (comments.length === 0) {
    return <p className="mt-8 text-[var(--muted)]">{status === "pending" ? "没有待审核的评论。" : "这里还没有评论。"}</p>;
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 border border-[var(--accent)] p-3 text-sm text-[var(--accent)]">
          {error}
        </p>
      ) : null}
      <ul className="mt-6 grid gap-4">
        {comments.map((comment) => (
          <li key={comment.id} className="border border-[var(--rule)] bg-white/60 p-4" aria-label={`Comment ${comment.id}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="font-bold">{comment.authorName || "匿名"}</span>
              {comment.email ? (
                <a className="underline" href={`mailto:${comment.email}`}>
                  {comment.email}
                </a>
              ) : (
                <span className="text-[var(--muted)]">无邮箱</span>
              )}
              <time className="text-[var(--muted)]" dateTime={comment.createdAt}>
                {formatTime(comment.createdAt)}
              </time>
              <span className="text-[var(--muted)]">{comment.locale === "en" ? "EN" : "中文"}</span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              评论于{" "}
              {comment.articleCategory && comment.articleSlug ? (
                <a className="underline" href={`/${comment.articleCategory}/${comment.articleSlug}#comments`} target="_blank" rel="noreferrer">
                  《{comment.articleTitle}》
                </a>
              ) : (
                <span>《{comment.articleTitle}》（未发布）</span>
              )}
            </p>
            <p className="mt-3 whitespace-pre-wrap break-words font-serif leading-7">{comment.body}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {actionsByStatus[status].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={busyId === comment.id}
                  onClick={() => act(comment, action)}
                  className={`border px-4 py-1.5 text-sm disabled:opacity-50 ${
                    action.status === "approved"
                      ? "border-[var(--ink)] bg-[var(--ink)] font-bold text-[var(--paper)]"
                      : action.destructive
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--rule)]"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
