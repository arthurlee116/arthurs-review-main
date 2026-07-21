import { after } from "next/server";
import type { Article } from "@/lib/services/articles";
import { invalidateProofs } from "@/lib/services/public-cache";
import { createPublicationProof } from "@/lib/services/publication-proofs";

export function schedulePublicationProof(article: Article) {
  if (article.status !== "published") return;
  after(async () => {
    try {
      await createPublicationProof(article);
      invalidateProofs(article.id);
    } catch (error) {
      console.error("Publication proof failed", error);
    }
  });
}
