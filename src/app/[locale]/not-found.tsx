import { PublicShell } from "@/app/_publicShell";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
export default async function NotFound() {
  const locale = await getLocale();
  return <PublicShell locale={locale}><main className="container py-16"><section className="reading border-y border-[var(--rule)] py-12"><h1 className="text-5xl font-bold">404</h1><p className="sans mt-4 text-sm text-[var(--muted)]">{dictionary(locale).notFound}</p></section></main></PublicShell>;
}
