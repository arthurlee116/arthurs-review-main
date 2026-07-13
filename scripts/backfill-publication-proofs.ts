import { migrate } from "@/lib/db/migrate";
import { getArticleById, listPublishedArticles } from "@/lib/services/articles";
import { createPublicationProof } from "@/lib/services/publication-proofs";

async function backfillPublicationProofs() {
  migrate();
  process.env.WAYBACK_POLL_ATTEMPTS ??= "200";

  let failures = 0;
  const articles = listPublishedArticles()
    .map((summary) => getArticleById(summary.id, { includeDraft: true }))
    .filter((article) => article !== null);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < articles.length) {
      const article = articles[nextIndex];
      nextIndex += 1;

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
  }

  await Promise.all(Array.from({ length: 3 }, () => worker()));

  if (failures) {
    console.error(`${failures} publication proof(s) incomplete.`);
    process.exitCode = 1;
  }
}

void backfillPublicationProofs();
