import Link from "next/link";

const links = [
  ["Home", "/"],
  ["时事评论", "/commentary"],
  ["社会分析", "/society"],
  ["杂七杂八", "/misc"],
  ["About", "/about"],
] as const;

export function PublicNav() {
  return (
    <nav className="container sans mt-6 border-y border-[var(--rule)] py-3 text-center text-xs uppercase tracking-[0.14em]">
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
        {links.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
