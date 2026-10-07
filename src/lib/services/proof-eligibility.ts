import type Database from "better-sqlite3";
import type { CategoryId } from "@/lib/content/categories";
import { getDb } from "@/lib/db/connection";

// Use the immutable source revision and the current public revision, never the draft.
// Older proofs may have no revision link; their original URL identifies life posts.
export const PUBLICATION_PROOF_ELIGIBLE_SQL = `
  not exists (
    select 1 from article_revisions as source
    where source.id = publication_proofs.article_revision_id and source.category = 'life'
  )
  and (publication_proofs.article_revision_id is not null or publication_proofs.public_url not glob '*://*/life/*')
  and not exists (
    select 1 from articles
    join article_revisions as current on current.id = articles.published_revision_id
    where articles.id = publication_proofs.article_id and current.category = 'life'
  )`;

export function isArticleProofEligible(article: { id: number; category: CategoryId }, db: Database.Database = getDb()) {
  if (article.category === "life") return false;
  return !db.prepare(`
    select 1 from articles
    join article_revisions as current on current.id = articles.published_revision_id
    where articles.id = ? and current.category = 'life'
  `).get(article.id);
}

export function isPublicationProofEligible(id: number, db: Database.Database = getDb()) {
  return Boolean(db.prepare(`select 1 from publication_proofs where id = ? and ${PUBLICATION_PROOF_ELIGIBLE_SQL}`).get(id));
}
