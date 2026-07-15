import Link from "next/link";
import { connection } from "next/server";

import { PublicShell } from "@/app/_publicShell";
import { articlePath } from "@/lib/content/urls";
import { publicPageMetadata } from "@/lib/metadata";
import { listCachedPublicPublicationProofs } from "@/lib/services/public-content";
import type { PublicPublicationProof } from "@/lib/services/publication-proofs";

export const instant = false;

export const metadata = publicPageMetadata({
  title: "Proofs",
  description: "Public content fingerprints, OpenTimestamps files, and Wayback snapshots for Arthur's Review.",
  path: "/proofs",
});

function groupByArticle(proofs: PublicPublicationProof[]) {
  const groups = new Map<number, PublicPublicationProof[]>();
  for (const proof of proofs) {
    const current = groups.get(proof.articleId);
    if (current) current.push(proof);
    else groups.set(proof.articleId, [proof]);
  }
  return [...groups.values()];
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function statusLabel(status: PublicPublicationProof["otsStatus"]) {
  if (status === "complete") return "complete";
  if (status === "pending") return "pending";
  return "failed";
}

export default async function ProofsPage() {
  await connection();
  const proofs = await listCachedPublicPublicationProofs();
  const groups = groupByArticle(proofs);
  const serviceStatuses = proofs.flatMap((proof) => [proof.otsStatus, proof.waybackStatus]);
  const complete = serviceStatuses.filter((status) => status === "complete").length;
  const pending = serviceStatuses.filter((status) => status === "pending").length;
  const failed = serviceStatuses.filter((status) => status === "failed").length;

  return (
    <PublicShell mastheadHeadingLevel={2}>
      <main className="container overflow-x-hidden pb-16">
        <header className="max-w-5xl py-10 md:py-14">
          <p className="sans text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Public verification</p>
          <h1 className="sans mt-4 max-w-5xl text-5xl font-bold leading-[0.95] tracking-[-0.04em] md:text-7xl">Proofs</h1>
          <p className="mt-6 max-w-[62ch] text-lg leading-8 text-[var(--muted)]">
            每次已发布内容发生变化，这里会留下内容哈希和可下载源文件。记录能证明内容不晚于该时间存在，但不主张这是首次发布日期。
          </p>
        </header>

        <section className="grid border-y border-[var(--rule)] md:grid-cols-12" aria-label="Proof totals">
          <div className="border-b border-[var(--rule)] py-6 md:col-span-5 md:border-b-0 md:border-r md:pr-8">
            <strong className="sans block text-4xl font-bold tracking-[-0.04em]">{countLabel(proofs.length, "proof")}</strong>
            <span className="sans mt-2 block text-xs text-[var(--muted)]">Content versions recorded</span>
          </div>
          <div className="border-b border-[var(--rule)] py-6 md:col-span-7 md:border-b-0 md:pl-8">
            <strong className="sans block text-4xl font-bold tracking-[-0.04em]">{countLabel(groups.length, "article")}</strong>
            <span className="sans mt-2 block text-xs text-[var(--muted)]">Articles represented</span>
          </div>
          <div className="py-6 md:col-span-7 md:border-r md:border-t md:pr-8">
            <strong className="sans block text-4xl font-bold tracking-[-0.04em]">{complete} complete</strong>
            <span className="sans mt-2 block text-xs text-[var(--muted)]">Verification services</span>
          </div>
          <div className="border-t border-[var(--rule)] py-6 md:col-span-5 md:pl-8">
            <div className="sans flex gap-6 text-2xl font-bold tracking-[-0.03em]">
              <strong>{pending} pending</strong>
              <strong className={failed ? "text-[var(--accent)]" : undefined}>{failed} failed</strong>
            </div>
            <span className="sans mt-2 block text-xs text-[var(--muted)]">OpenTimestamps and Wayback combined</span>
          </div>
        </section>

        {groups.length ? (
          <div className="py-6 md:py-10">
            {groups.map((articleProofs) => {
              const article = articleProofs[0]!;
              const headingId = `proof-article-${article.articleId}`;
              return (
                <section key={article.articleId} className="grid gap-6 border-b border-[var(--rule)] py-10 md:grid-cols-[minmax(12rem,0.8fr)_2fr] md:gap-12" aria-labelledby={headingId}>
                  <div>
                    <p className="sans text-xs text-[var(--muted)]">{countLabel(articleProofs.length, "version")}</p>
                    <h2 id={headingId} className="mt-2 text-3xl font-bold leading-tight">
                      <Link className="transition-colors hover:text-[var(--accent)] focus-visible:text-[var(--accent)]" href={articlePath(article.articleCategory, article.articleSlug)}>
                        {article.articleTitle}
                      </Link>
                    </h2>
                  </div>

                  <ol className="grid gap-5 sm:grid-cols-2">
                    {articleProofs.map((proof) => (
                      <li key={proof.id} className="border border-[var(--rule)] bg-white/30 p-5 transition-transform duration-200 hover:-translate-y-0.5 focus-within:-translate-y-0.5">
                        <time className="sans text-xs text-[var(--muted)]" dateTime={proof.createdAt}>
                          {proof.createdAt.replace("T", " ").replace(".000Z", " UTC")}
                        </time>
                        <dl className="sans mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                          <dt className="text-[var(--muted)]">OpenTimestamps</dt>
                          <dd className="text-right font-bold">{statusLabel(proof.otsStatus)}</dd>
                          <dt className="text-[var(--muted)]">Wayback</dt>
                          <dd className="text-right font-bold">{statusLabel(proof.waybackStatus)}</dd>
                        </dl>
                        <p className="sans mt-5 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--muted)]">SHA-256</p>
                        <code className="mt-2 block break-all text-xs leading-5">{proof.documentSha256}</code>
                        <div className="sans mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4">
                          <Link href={`/proofs/${proof.id}/source`}>Source JSON</Link>
                          {proof.otsAvailable ? <Link href={`/proofs/${proof.id}/ots`}>OpenTimestamps</Link> : null}
                          {proof.waybackUrl ? (
                            <a href={proof.waybackUrl} rel="noreferrer" target="_blank">
                              Wayback snapshot
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        ) : (
          <section className="border-b border-[var(--rule)] py-16">
            <h2 className="text-3xl font-bold">No proofs yet</h2>
            <p className="mt-3 max-w-[55ch] text-[var(--muted)]">The first record will appear after a published article is saved.</p>
          </section>
        )}
      </main>
    </PublicShell>
  );
}
