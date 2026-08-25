import { revalidateTag } from "next/cache";

export {
  PUBLIC_ARTICLE_LIST_TAG,
  PUBLIC_PROOFS_TAG,
  PUBLIC_SETTINGS_TAG,
  publicArticleProofsTag,
  publicArticleTag,
} from "./public-cache-tags";

export function invalidateCacheTags(tags: string[]) {
  if (tags.length > 128 || tags.some((tag) => !tag.startsWith("public:") || tag.length > 256)) {
    throw new Error("Invalid public cache tags.");
  }
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}
