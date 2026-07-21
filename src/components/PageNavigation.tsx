import type { Route } from "next";
import Link from "next/link";

function pageHref(basePath: string, page: number, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return `${basePath}${suffix ? `?${suffix}` : ""}` as Route;
}

export function PageNavigation({
  basePath,
  page,
  totalPages,
  params = {},
  label,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  params?: Record<string, string | undefined>;
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="sans mt-8 flex items-center justify-between border-y border-[var(--rule)] py-4 text-sm" aria-label={label}>
      {page > 1 ? <Link href={pageHref(basePath, page - 1, params)}>Previous</Link> : <span className="text-[var(--muted)]">Previous</span>}
      <span className="text-[var(--muted)]">Page {page} of {totalPages}</span>
      {page < totalPages ? <Link href={pageHref(basePath, page + 1, params)}>Next</Link> : <span className="text-[var(--muted)]">Next</span>}
    </nav>
  );
}
