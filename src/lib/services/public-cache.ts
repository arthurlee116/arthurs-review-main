import { revalidateTag } from "next/cache";
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

function expireTags(tags: string[]) {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}

export function invalidateArticleLists() {
  expireTags([PUBLIC_ARTICLE_LIST_TAG]);
}

export function invalidateArticlePublication({
  oldPath,
  newPath,
}: {
  oldPath?: { category: CategoryId; slug: string } | null;
  newPath?: { category: CategoryId; slug: string } | null;
}) {
  expireTags([
    PUBLIC_ARTICLE_LIST_TAG,
    ...(oldPath ? [publicArticleTag(oldPath.category, oldPath.slug)] : []),
    ...(newPath ? [publicArticleTag(newPath.category, newPath.slug)] : []),
  ]);
}

export function invalidateSettings() {
  expireTags([PUBLIC_SETTINGS_TAG]);
}

export function invalidateProofs(articleId: number) {
  expireTags([PUBLIC_PROOFS_TAG, publicArticleProofsTag(articleId)]);
}
