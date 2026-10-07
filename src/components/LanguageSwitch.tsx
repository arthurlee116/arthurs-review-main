"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { setLocale } from "@/lib/i18n/actions";
import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";

export function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const returnTo = `${pathname ?? `/${locale}`}${params?.toString() ? `?${params.toString()}` : ""}`;
  return <form action={setLocale} aria-label={dictionary(locale).language} className="flex items-center gap-2" onSubmit={(event) => {
    const input = event.currentTarget.elements.namedItem("returnTo") as HTMLInputElement;
    input.value = `${returnTo}${window.location.hash}`;
  }}>
    <input type="hidden" name="returnTo" value={returnTo} readOnly />
    <button name="locale" value="zh" type="submit" aria-pressed={locale === "zh"} className={locale === "zh" ? "underline decoration-[var(--accent)] decoration-2 underline-offset-4" : "text-[var(--muted)] hover:underline"}>中文</button>
    <span aria-hidden="true">/</span>
    <button name="locale" value="en" type="submit" aria-pressed={locale === "en"} className={locale === "en" ? "underline decoration-[var(--accent)] decoration-2 underline-offset-4" : "text-[var(--muted)] hover:underline"}>English</button>
  </form>;
}
