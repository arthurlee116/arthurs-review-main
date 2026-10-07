import { Suspense } from "react";
import { CategoryPage, CategoryPageFallback } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";
import { getLocale } from "@/lib/i18n/server";
export async function generateMetadata() { return categoryMetadata("commentary", undefined, await getLocale()); }
export default async function CategoryRoute() {
  const locale = await getLocale();
  return <Suspense fallback={<CategoryPageFallback locale={locale} />}><CategoryPage category="commentary" locale={locale} /></Suspense>;
}
