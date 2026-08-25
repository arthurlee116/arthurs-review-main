import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { getDb } from "./connection";
import { tokenizeForFts } from "./fts";
import { readMarkdownBody } from "@/lib/content/markdown";

export type Migration = {
  version: number;
  name: string;
  filename: string;
  up: (db: Database.Database) => void;
};

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

function execSql(filename: string) {
  return (db: Database.Database) => db.exec(fs.readFileSync(path.join(migrationsDir, filename), "utf8"));
}

// Migrations whose up() is more than "execute the SQL file".
const customUps: Record<string, (db: Database.Database) => void> = {
  "002_rebuild_fts_shadow.sql": (db) => rebuildArticleSearchWithShadow(db),
  "003_article_revisions.sql": (db) => {
    execSql("003_article_revisions.sql")(db);
    rebuildArticleSearchWithShadow(db);
  },
};

// Migrations are discovered from the migrations directory: NNN_name.sql files,
// version = position in numeric order (= file count), per AGENTS.md convention.
function loadMigrations(): Migration[] {
  const filenames = fs
    .readdirSync(migrationsDir)
    .filter((filename) => /^\d{3}_.+\.sql$/.test(filename))
    .sort();
  return filenames.map((filename, index) => {
    const version = index + 1;
    if (Number(filename.slice(0, 3)) !== version) {
      throw new Error(`Migration filenames must be numbered sequentially from 001; got ${filename} at position ${version}.`);
    }
    const name = filename.slice(4, -4);
    return { version, name, filename, up: customUps[filename] ?? execSql(filename) };
  });
}

export const migrations: Migration[] = loadMigrations();

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

function readDataFile(relativePath: string | null) {
  if (!relativePath) return "";
  try {
    return readMarkdownBody(relativePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing Markdown body file: ${relativePath}`);
    }
    throw error;
  }
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
  db.exec(fs.readFileSync(path.join(migrationsDir, "002_rebuild_fts_shadow.sql"), "utf8"));
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
  const pending = orderedMigrations.slice(applied.length);
  if (pending.length === 0) return;

  // Table-rebuild migrations (rename/copy/drop) break on deferred foreign keys, and
  // `pragma foreign_keys = off` is a no-op inside a transaction, so the runner wraps
  // the pending batch instead and verifies referential integrity at the end.
  db.pragma("foreign_keys = off");
  try {
    for (const migration of pending) {
      db.transaction(() => {
        migration.up(db);
        record.run(migration.version, migration.name, new Date().toISOString());
      }).immediate();
    }
  } finally {
    db.pragma("foreign_keys = on");
  }
  if ((db.pragma("foreign_key_check") as Array<unknown>).length > 0) {
    throw new Error("Foreign key violations after migrations.");
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
