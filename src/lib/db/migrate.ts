import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection";
import { getDataPaths } from "@/lib/env";

type ArticleSearchRow = {
  id: number;
  title_zh: string;
  title_en: string | null;
  excerpt_zh: string;
  excerpt_en: string | null;
  body_zh_path: string;
  body_en_path: string | null;
  category: string;
  tags: string | null;
};

function tokenizeForFts(text: string): string {
  return text
    .replace(/([\p{Script=Han}])/gu, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function readDataFile(relativePath: string | null) {
  if (!relativePath) return "";
  const { root } = getDataPaths();
  const fullPath = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (fullPath !== normalizedRoot && !fullPath.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Path escapes DATA_DIR.");
  }
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

function createArticleSearchTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    create virtual table article_search using fts5(
      title_zh,
      title_en,
      excerpt_zh,
      excerpt_en,
      body_zh,
      body_en,
      category,
      tags,
      tokenize='unicode61'
    );
  `);
}

function rebuildArticleSearch(db: ReturnType<typeof getDb>) {
  db.prepare("delete from article_search").run();
  const rows = db
    .prepare(
      `select articles.id, articles.title_zh, articles.title_en, articles.excerpt_zh, articles.excerpt_en,
              articles.body_zh_path, articles.body_en_path, articles.category, group_concat(tags.name, ' ') as tags
       from articles
       left join article_tags on article_tags.article_id = articles.id
       left join tags on tags.id = article_tags.tag_id
       where articles.status = 'published'
       group by articles.id
       order by articles.id`,
    )
    .all() as ArticleSearchRow[];

  const insert = db.prepare(
    `insert or replace into article_search(rowid, title_zh, title_en, excerpt_zh, excerpt_en, body_zh, body_en, category, tags)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run(
        row.id,
        tokenizeForFts(row.title_zh),
        row.title_en ?? "",
        tokenizeForFts(row.excerpt_zh),
        row.excerpt_en ?? "",
        tokenizeForFts(readDataFile(row.body_zh_path)),
        readDataFile(row.body_en_path),
        tokenizeForFts(row.category),
        tokenizeForFts(row.tags ?? ""),
      );
    }
  });
  tx();
}

function migrateContentlessArticleSearch(db: ReturnType<typeof getDb>) {
  const table = db.prepare("select sql from sqlite_master where type = 'table' and name = 'article_search'").get() as
    | { sql: string }
    | undefined;
  if (!table?.sql.includes("content=''")) return;

  db.exec("drop table article_search");
  createArticleSearchTable(db);
  rebuildArticleSearch(db);
}

export function migrate() {
  const db = getDb();
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const schema = fs.readFileSync(path.join(dirname, "schema.sql"), "utf8");
  db.exec(schema);
  migrateContentlessArticleSearch(db);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate();
}
