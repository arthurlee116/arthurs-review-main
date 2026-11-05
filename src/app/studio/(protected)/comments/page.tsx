import Link from "next/link";
import type { Route } from "next";
import { connection } from "next/server";
import { CommentModerationList } from "@/components/studio/CommentModerationList";
import { commentStatuses, countCommentsByStatus, listStudioComments, type CommentStatus } from "@/lib/services/comments";

export const instant = false;

const statusLabels: Record<CommentStatus, string> = { pending: "待审核", approved: "已通过", rejected: "已拒绝" };

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  const params = await searchParams;
  const status: CommentStatus = commentStatuses.find((value) => value === params.status) ?? "pending";
  const counts = countCommentsByStatus();
  const comments = listStudioComments(status);

  return (
    <section className="sans">
      <h1 className="font-serif text-4xl font-bold">Comments</h1>
      <nav aria-label="Comment status" className="mt-6 flex gap-2 border-b border-[var(--rule)]">
        {commentStatuses.map((value) => (
          <Link
            key={value}
            href={`/studio/comments?status=${value}` as Route}
            aria-current={value === status ? "page" : undefined}
            className={`-mb-px border border-b-0 px-4 py-2 text-sm ${value === status ? "border-[var(--rule)] bg-white font-bold" : "border-transparent text-[var(--muted)]"}`}
          >
            {statusLabels[value]} <span className="tabular-nums">({counts[value]})</span>
          </Link>
        ))}
      </nav>
      <CommentModerationList key={status} status={status} initialComments={comments} />
    </section>
  );
}
