import type { CategoryId } from "@/lib/content/categories";

export const PUBLIC_ARTICLE_LIST_TAG = "public:article-lists";
export const PUBLIC_SETTINGS_TAG = "public:settings";
export const PUBLIC_PROOFS_TAG = "public:proofs";

export function publicArticleTag(category: CategoryId, slug: string) {
  return `public:article:${category}:${slug}`;
}

export function publicArticleProofsTag(articleId: number) {
  return `public:proofs:article:${articleId}`;
}
