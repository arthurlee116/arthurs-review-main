import { SearchBox } from "@/components/SearchBox";

export function Masthead({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const titleClassName = "whitespace-nowrap font-[Georgia,Times_New_Roman,serif] text-[clamp(30px,10.4vw,48px)] font-bold leading-none md:text-7xl";

  return (
    <header className="container pt-6 text-center">
      <div className="relative">
        {headingLevel === 1 ? <h1 className={titleClassName}>Arthur&apos;s Review</h1> : <div className={titleClassName}>Arthur&apos;s Review</div>}
        <div className="mt-4 flex justify-center lg:absolute lg:-right-4 lg:top-1/2 lg:mt-0 lg:w-64 lg:-translate-y-1/2">
          <SearchBox className="w-full" />
        </div>
      </div>
      <div className="mx-auto mt-4 h-2 w-24 bg-[var(--accent)]" />
    </header>
  );
}
