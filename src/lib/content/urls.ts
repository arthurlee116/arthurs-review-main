import type { Route } from "next";
import type { CategoryId } from "./categories";

export function articlePath(category: CategoryId, slug: string): Route {
  return `/${category}/${slug}` as Route;
}

export function categoryPath(category: CategoryId): Route {
  return `/${category}` as Route;
}
