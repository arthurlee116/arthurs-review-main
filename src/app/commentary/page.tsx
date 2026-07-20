import { CategoryPage } from "@/app/_categoryPage";
import { categoryMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return categoryMetadata("commentary", "时事评论");
}

export default function CommentaryPage() {
  return <CategoryPage category="commentary" />;
}
