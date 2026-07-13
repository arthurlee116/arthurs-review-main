import { migrate } from "@/lib/db/migrate";
import { getArticleById, listPublishedArticles } from "@/lib/services/articles";
import { createPublicationProof } from "@/lib/services/publication-proofs";

async function backfillPublicationProofs() {
  migrate();

  let failures = 0;
  for (const summary of listPublishedArticles()) {
    const article = getArticleById(summary.id, { includeDraft: true });
    if (!article) continue;

    try {
      const proof = await createPublicationProof(article);
      console.log(
        JSON.stringify({
          id: article.id,
          slug: article.slug,
          ots: proof?.otsStatus,
          wayback: proof?.waybackStatus,
          waybackUrl: proof?.waybackUrl,
          sha256: proof?.documentSha256,
        }),
      );
      if (proof?.otsStatus !== "complete" || proof.waybackStatus !== "complete") failures += 1;
    } catch (error) {
      failures += 1;
      console.error(
        JSON.stringify({ id: article.id, slug: article.slug, error: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  if (failures) {
    console.error(`${failures} publication proof(s) incomplete.`);
    process.exitCode = 1;
  }
}

void backfillPublicationProofs();
