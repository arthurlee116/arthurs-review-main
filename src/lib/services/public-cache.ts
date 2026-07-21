import { revalidateTag } from "next/cache";
import type { CategoryId } from "@/lib/content/categories";
import {
  PUBLIC_ARTICLE_LIST_TAG,
  PUBLIC_PROOFS_TAG,
  PUBLIC_SETTINGS_TAG,
  publicArticleProofsTag,
  publicArticleTag,
} from "./public-cache-tags";

export {
  PUBLIC_ARTICLE_LIST_TAG,
  PUBLIC_PROOFS_TAG,
  PUBLIC_SETTINGS_TAG,
  publicArticleProofsTag,
  publicArticleTag,
} from "./public-cache-tags";

function expireTags(tags: string[]) {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}

export function invalidateCacheTags(tags: string[]) {
  if (tags.length > 128 || tags.some((tag) => !tag.startsWith("public:") || tag.length > 256)) {
    throw new Error("Invalid public cache tags.");
  }
  expireTags(tags);
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
