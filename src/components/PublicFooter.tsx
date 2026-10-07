import Link from "next/link";
import { Suspense } from "react";
import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, type Locale } from "@/lib/i18n/locale";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { FooterWechat } from "@/components/FooterWechat";

export function PublicFooter({ locale = "zh" }: { locale?: Locale }) {
  const t = dictionary(locale);
  return (
    <footer className="mt-auto border-t-2 border-[var(--rule)]">
      <div className="container grid gap-10 py-10 md:grid-cols-[1.35fr_0.65fr] md:py-14">
        <div className="max-w-2xl">
          <p className="text-4xl font-bold leading-none tracking-[-0.04em] md:text-5xl">Arthur&apos;s Review</p>
          <p className="mt-5 max-w-[52ch] text-base leading-7 text-[var(--muted)]">{t.footerDescription}</p>
          <a className="sans mt-6 inline-block text-sm font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4" href="mailto:laoliarthur@outlook.com">
            laoliarthur@outlook.com
          </a>
          <a className="sans ml-4 inline-block text-sm font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4" href="mailto:iii7201027@proton.me">
            iii7201027@proton.me
          </a>
          <FooterWechat locale={locale} />
        </div>

        <nav className="sans grid grid-cols-2 content-start gap-x-8 gap-y-4 text-sm font-bold md:justify-self-end" aria-label={t.footer}>
          <Link href={localizedPath("/archive", locale)}>{t.archive}</Link>
          <Link href={localizedPath("/proofs", locale)}>{t.proofs}</Link>
          <Link href={localizedPath("/about", locale)}>{t.about}</Link>
          <Link href={localizedPath("/feed.xml", locale)}>RSS</Link>
          <div className="col-span-2 mt-2" data-language-switch><Suspense fallback={<span>{locale === "zh" ? "中文" : "English"}</span>}><LanguageSwitch locale={locale} /></Suspense></div>
        </nav>
      </div>
      <div className="border-t border-[var(--rule)]">
        <div className="container sans flex flex-wrap justify-between gap-3 py-4 text-xs text-[var(--muted)]">
          <span>© Arthur</span>
          <a href="https://db-ip.com">{t.geolocation}</a>
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">{t.license}</a>
        </div>
      </div>
    </footer>
  );
}
