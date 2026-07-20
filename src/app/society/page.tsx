import { Suspense } from "react";
import { CategoryPage, CategoryPageFallback } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return categoryMetadata("society", "社会分析");
}

export default function SocietyPage() {
  return <Suspense fallback={<CategoryPageFallback />}><CategoryPage category="society" /></Suspense>;
}
