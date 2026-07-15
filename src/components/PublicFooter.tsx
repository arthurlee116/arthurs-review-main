import Link from "next/link";
import type { Route } from "next";

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t-2 border-[var(--rule)]" role="contentinfo">
      <div className="container grid gap-10 py-10 md:grid-cols-[1.35fr_0.65fr] md:py-14">
        <div className="max-w-2xl">
          <p className="text-4xl font-bold leading-none tracking-[-0.04em] md:text-5xl">Arthur&apos;s Review</p>
          <p className="mt-5 max-w-[52ch] text-base leading-7 text-[var(--muted)]">文章、评论和一些值得长期保留的东西。</p>
          <a className="sans mt-6 inline-block text-sm font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4" href="mailto:laoliarthur@outlook.com">
            laoliarthur@outlook.com
          </a>
        </div>

        <nav className="sans grid grid-cols-2 content-start gap-x-8 gap-y-4 text-sm font-bold md:justify-self-end" aria-label="Footer">
          <Link href={"/archive" as Route}>Archive</Link>
          <Link href={"/proofs" as Route}>Proofs</Link>
          <Link href="/about">About</Link>
          <Link href="/feed.xml">RSS</Link>
        </nav>
      </div>
      <div className="border-t border-[var(--rule)]">
        <div className="container sans flex flex-wrap justify-between gap-3 py-4 text-xs text-[var(--muted)]">
          <span>© {new Date().getUTCFullYear()} Arthur</span>
          <span>Independent publication</span>
        </div>
      </div>
    </footer>
  );
}
