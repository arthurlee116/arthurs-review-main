import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, type Locale } from "@/lib/i18n/locale";
import { MAX_SEARCH_CODE_POINTS } from "@/lib/search-limits";

export function SearchBox({ defaultValue = "", className = "", locale = "zh" }: { defaultValue?: string; className?: string; locale?: Locale }) {
  return (
    <form action={localizedPath("/search", locale)} className={`sans flex max-w-xl gap-3 ${className}`}>
      <input
        name="q"
        maxLength={MAX_SEARCH_CODE_POINTS}
        defaultValue={defaultValue}
        className="min-w-0 flex-1 border border-[var(--rule)] bg-transparent px-3 py-1.5 text-xs md:py-2 md:text-sm"
        aria-label={dictionary(locale).search}
      />
      <button className="border border-[var(--rule)] bg-[var(--ink)] px-3 py-1.5 text-xs text-[var(--paper)] md:px-4 md:py-2 md:text-sm">{dictionary(locale).search}</button>
    </form>
  );
}
