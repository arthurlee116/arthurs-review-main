import { Suspense } from "react";
import { CategoryPage, CategoryPageFallback } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";
import { getLocale } from "@/lib/i18n/server";
export async function generateMetadata() { return categoryMetadata("misc", undefined, await getLocale()); }
export default async function CategoryRoute() {
  const locale = await getLocale();
  return <Suspense fallback={<CategoryPageFallback locale={locale} />}><CategoryPage category="misc" locale={locale} /></Suspense>;
}
