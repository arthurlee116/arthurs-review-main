import type { CategoryId } from "./categories";

export function articlePath(category: CategoryId, slug: string) {
  return `/${category}/${slug}`;
}

export function categoryPath(category: CategoryId) {
  return `/${category}`;
}
