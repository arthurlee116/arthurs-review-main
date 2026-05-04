import { CategoryPage } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return categoryMetadata("misc", "杂七杂八");
}

export default function MiscPage() {
  return <CategoryPage category="misc" />;
}
