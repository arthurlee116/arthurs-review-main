import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { getDb } from "./connection";
import { getDataPaths } from "@/lib/env";

export type Migration = {
  version: number;
  name: string;
  filename: string;
  up: (db: Database.Database) => void;
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations: Migration[] = [
  {
    version: 1,
    name: "initial",
    filename: "001_initial.sql",
    up: (db) => db.exec(fs.readFileSync(path.join(dirname, "migrations", "001_initial.sql"), "utf8")),
  },
  {
    version: 2,
    name: "rebuild_fts_shadow",
    filename: "002_rebuild_fts_shadow.sql",
    up: (db) => rebuildArticleSearchWithShadow(db),
  },
  {
    version: 3,
    name: "article_revisions",
    filename: "003_article_revisions.sql",
    up: (db) => {
      db.exec(fs.readFileSync(path.join(dirname, "migrations", "003_article_revisions.sql"), "utf8"));
      rebuildArticleSearchWithShadow(db);
    },
  },
  {
    version: 4,
    name: "article_url_history",
    filename: "004_article_url_history.sql",
    up: (db) => db.exec(fs.readFileSync(path.join(dirname, "migrations", "004_article_url_history.sql"), "utf8")),
  },
  {
    version: 5,
    name: "ots_verification_states",
    filename: "005_ots_verification_states.sql",
    up: (db) => db.exec(fs.readFileSync(path.join(dirname, "migrations", "005_ots_verification_states.sql"), "utf8")),
  },
  {
    version: 6,
    name: "durable_jobs",
    filename: "006_durable_jobs.sql",
    up: (db) => db.exec(fs.readFileSync(path.join(dirname, "migrations", "006_durable_jobs.sql"), "utf8")),
  },
];

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
  if (!fs.existsSync(fullPath)) throw new Error(`Missing Markdown body file: ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function articleSearchRows(db: Database.Database) {
  const articleColumns = db.pragma("table_info(articles)") as Array<{ name: string }>;
  if (!articleColumns.some((column) => column.name === "status")) {
    return db
      .prepare(
        `select articles.id, revisions.title_zh, revisions.title_en, revisions.excerpt_zh, revisions.excerpt_en,
                revisions.body_zh_path, revisions.body_en_path, revisions.category, group_concat(tags.name, ' ') as tags
         from articles
         join article_revisions as revisions on revisions.id = articles.published_revision_id
         left join article_revision_tags on article_revision_tags.revision_id = revisions.id
         left join tags on tags.id = article_revision_tags.tag_id
         group by articles.id, revisions.id
         order by articles.id`,
      )
      .all() as ArticleSearchRow[];
  }

  return db
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
}

function populateArticleSearch(db: Database.Database, tableName: "article_search_shadow") {
  const rows = articleSearchRows(db);
  const insert = db.prepare(
    `insert into ${tableName}(rowid, title_zh, title_en, excerpt_zh, excerpt_en, body_zh, body_en, category, tags)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

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
  return rows;
}

export function rebuildArticleSearchWithShadow(db: Database.Database, beforeSwap: () => void = () => undefined) {
  db.exec(fs.readFileSync(path.join(dirname, "migrations", "002_rebuild_fts_shadow.sql"), "utf8"));
  const expected = populateArticleSearch(db, "article_search_shadow").map((row) => row.id);
  const actual = (db.prepare("select rowid from article_search_shadow order by rowid").all() as Array<{ rowid: number }>).map((row) => row.rowid);
  if (actual.length !== expected.length || actual.some((rowid, index) => rowid !== expected[index])) {
    throw new Error("Shadow FTS verification failed.");
  }

  beforeSwap();
  db.exec("drop table article_search; alter table article_search_shadow rename to article_search");
}

function validateMigrations(orderedMigrations: Migration[]) {
  orderedMigrations.forEach((migration, index) => {
    const version = index + 1;
    const expectedFilename = `${String(version).padStart(3, "0")}_${migration.name}.sql`;
    if (migration.version !== version) throw new Error(`Migration versions must be sequential from 1; expected ${version}.`);
    if (migration.filename !== expectedFilename) throw new Error(`Migration filename must be ${expectedFilename}.`);
  });
}

export function runMigrations(db: Database.Database, orderedMigrations: Migration[] = migrations) {
  validateMigrations(orderedMigrations);
  db.exec(`
    create table if not exists schema_migrations (
      version integer primary key,
      name text not null,
      applied_at text not null
    )
  `);

  const applied = db.prepare("select version, name from schema_migrations order by version").all() as Array<{ version: number; name: string }>;
  for (const [index, row] of applied.entries()) {
    if (row.version !== index + 1) throw new Error(`Applied migration history has a gap before version ${row.version}.`);
    const expected = orderedMigrations[row.version - 1];
    if (!expected || expected.name !== row.name) throw new Error(`Unknown or changed migration ${row.version}:${row.name}.`);
  }

  const record = db.prepare("insert into schema_migrations(version, name, applied_at) values (?, ?, ?)");
  for (const migration of orderedMigrations.slice(applied.length)) {
    db.transaction(() => {
      migration.up(db);
      record.run(migration.version, migration.name, new Date().toISOString());
    }).immediate();
  }
}

export function migrate() {
  const db = getDb();
  db.pragma("journal_mode = WAL");
  runMigrations(db);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate();
}
