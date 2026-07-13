import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type { Article } from "@/lib/services/articles";
import { createPublicationProof } from "@/lib/services/publication-proofs";

const PUBLIC_CONTENT_TAG = "public-content";

export function invalidatePublicContent() {
  revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 });
}

export function schedulePublicationProof(article: Article) {
  if (article.status !== "published") return;
  invalidatePublicContent();
  after(async () => {
    try {
      await createPublicationProof(article);
      invalidatePublicContent();
    } catch (error) {
      console.error("Publication proof failed", error);
    }
  });
}
