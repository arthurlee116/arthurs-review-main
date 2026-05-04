import { CategoryPage } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return categoryMetadata("society", "社会分析");
}

export default function SocietyPage() {
  return <CategoryPage category="society" />;
}
