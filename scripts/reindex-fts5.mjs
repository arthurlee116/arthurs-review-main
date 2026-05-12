process.env.DATA_DIR ||= "./data";
process.env.SITE_URL ||= "http://localhost:3000";
process.env.ADMIN_PASSWORD_HASH ||= "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
process.env.SESSION_SECRET ||= "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

const { migrate } = await import("../src/lib/db/migrate.ts");
const { getDb } = await import("../src/lib/db/connection.ts");
const { listPublishedArticles } = await import("../src/lib/services/articles.ts");
const { syncArticleToFts } = await import("../src/lib/services/search.ts");

migrate();

const db = getDb();
db.prepare("DELETE FROM article_search").run();

const articles = listPublishedArticles();
for (const article of articles) {
  syncArticleToFts(article);
}

console.log(`Re-indexed ${articles.length} published articles into FTS5.`);