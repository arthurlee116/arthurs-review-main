"use client";

import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["home", "/"],
  ["recommended", "/recommended"],
  ["commentary", "/commentary"],
  ["society", "/society"],
  ["misc", "/misc"],
  ["life", "/life"],
  ["archive", "/archive"],
  ["proofs", "/proofs"],
  ["about", "/about"],
] as const;

const activeClasses = "underline decoration-[var(--accent)] decoration-2 underline-offset-8";
const hoverClasses = "hover:underline hover:decoration-[var(--accent)] hover:decoration-2 hover:underline-offset-8";

function NavLinks({ pathname, locale }: { pathname: string | null; locale: Locale }) {
  const t = dictionary(locale);
  const current = pathname === null ? null : stripLocale(pathname);
  return (
    <div className="mt-5">
      <nav className="container sans border-y border-[var(--rule)] py-3 text-center text-xs uppercase tracking-[0.14em]">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
          {links.map(([label, href]) => {
            const isActive = current !== null && (href === "/" ? current === "/" : current.startsWith(href));
            return (
              <Link
                key={href}
                href={localizedPath(href, locale)}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? activeClasses : hoverClasses}
              >
                {t[label]}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ponytail: static fallback for prerender; active state hydrates in via PublicNav
export function PublicNavStatic({ locale = "zh" }: { locale?: Locale }) {
  return <NavLinks pathname={null} locale={locale} />;
}

export function PublicNav({ locale = "zh" }: { locale?: Locale }) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} locale={locale} />;
}
