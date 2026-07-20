import { Suspense } from "react";
import { CategoryPage, CategoryPageFallback } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return categoryMetadata("misc", "杂七杂八");
}

export default function MiscPage() {
  return <Suspense fallback={<CategoryPageFallback />}><CategoryPage category="misc" /></Suspense>;
}
