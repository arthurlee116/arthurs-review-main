export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/search" className="sans flex max-w-xl gap-3">
      <input
        name="q"
        defaultValue={defaultValue}
        className="min-w-0 flex-1 border border-[var(--rule)] bg-transparent px-3 py-2 text-sm"
        aria-label="Search"
      />
      <button className="border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)]">Search</button>
    </form>
  );
}
