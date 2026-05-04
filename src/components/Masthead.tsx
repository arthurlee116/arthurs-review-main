import { SearchBox } from "@/components/SearchBox";

export function Masthead() {
  return (
    <header className="container pt-8 text-center">
      <div className="relative">
        <h1 className="text-5xl font-bold leading-none md:text-7xl">Arthur&apos;s Review</h1>
        <div className="mt-5 flex justify-center lg:absolute lg:-right-4 lg:top-1/2 lg:mt-0 lg:w-64 lg:-translate-y-1/2">
          <SearchBox className="w-full" />
        </div>
      </div>
      <div className="mx-auto mt-2 h-2 w-24 bg-[var(--accent)]" />
    </header>
  );
}
