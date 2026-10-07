import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, interpolate, type Locale } from "@/lib/i18n/locale";
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
  locale,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  params?: Record<string, string | undefined>;
  label: string;
  locale?: Locale;
}) {
  const t = dictionary(locale ?? "en");
  if (totalPages <= 1) return null;
  return (
    <nav className="sans mt-8 flex items-center justify-between border-y border-[var(--rule)] py-4 text-sm" aria-label={label}>
      {page > 1 ? <Link href={pageHref(locale ? localizedPath(basePath, locale) : basePath, page - 1, params)}>{t.previous}</Link> : <span className="text-[var(--muted)]">{t.previous}</span>}
      <span className="text-[var(--muted)]">{interpolate(t.pageOf, { page, total: totalPages })}</span>
      {page < totalPages ? <Link href={pageHref(locale ? localizedPath(basePath, locale) : basePath, page + 1, params)}>{t.next}</Link> : <span className="text-[var(--muted)]">{t.next}</span>}
    </nav>
  );
}
