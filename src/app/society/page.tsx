import { CategoryPage } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return categoryMetadata("society", "社会分析");
}

export default function SocietyPage() {
  return <CategoryPage category="society" />;
}
export const instant = false;
