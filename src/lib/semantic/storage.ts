import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";

export function deleteArticleEmbeddings(articleId: number, db: Database.Database = getDb()) {
  return db.prepare("delete from article_embedding_chunks where article_id = ?").run(articleId).changes;
}
