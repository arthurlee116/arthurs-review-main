import Link from "next/link";

export function StudioNav() {
  return (
    <nav className="sans border-b border-[var(--rule)] p-4 text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-5">
        <Link href="/studio/articles">Articles</Link>
        <Link href="/studio/articles/new">New article</Link>
        <Link href="/studio/life/new">发生活</Link>
        <Link href="/studio/tags">Tags</Link>
        <Link href="/studio/settings">Settings</Link>
      </div>
    </nav>
  );
}
