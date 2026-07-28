import { MAX_SEARCH_CODE_POINTS } from "@/lib/search-limits";

export function SearchBox({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/search" className={`sans flex max-w-xl gap-3 ${className}`}>
      <input
        name="q"
        maxLength={MAX_SEARCH_CODE_POINTS}
        defaultValue={defaultValue}
        className="min-w-0 flex-1 border border-[var(--rule)] bg-transparent px-3 py-1.5 text-xs md:py-2 md:text-sm"
        aria-label="Search"
      />
      <button className="border border-[var(--rule)] bg-[var(--ink)] px-3 py-1.5 text-xs text-[var(--paper)] md:px-4 md:py-2 md:text-sm">Search</button>
    </form>
  );
}
