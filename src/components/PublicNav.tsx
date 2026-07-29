"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const links = [
  ["Home", "/"],
  ["时事评论", "/commentary"],
  ["社会分析", "/society"],
  ["杂七杂八", "/misc"],
  ["Archive", "/archive"],
  ["Proofs", "/proofs"],
  ["About", "/about"],
] as const;

const activeClasses = "underline decoration-[var(--accent)] decoration-2 underline-offset-8";
const hoverClasses = "hover:underline hover:decoration-[var(--accent)] hover:decoration-2 hover:underline-offset-8";

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <div className="mt-5">
      <nav className="container sans border-y border-[var(--rule)] py-3 text-center text-xs uppercase tracking-[0.14em]">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
          {links.map(([label, href]) => {
            const isActive = pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href as Route}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? activeClasses : hoverClasses}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ponytail: static fallback for prerender; active state hydrates in via PublicNav
export function PublicNavStatic() {
  return <NavLinks pathname={null} />;
}

export function PublicNav() {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} />;
}
