import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Migration } from "@/lib/db/migrate";

let tmpDir: string;

function createLegacyPublishedArticle({ writeBody = true }: { writeBody?: boolean } = {}) {
  const db = new Database(path.join(tmpDir, "arthurs-review.sqlite3"));
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync("tests/fixtures/legacy-schema.sql", "utf8"));
  db.exec("drop table article_search");
  db.exec(`
    create virtual table article_search using fts5(
      title_zh, title_en, excerpt_zh, excerpt_en, body_zh, body_en, category, tags,
      content='', tokenize='unicode61'
    )
  `);
  db.prepare(
    `insert into articles(
       id, title_zh, title_en, slug, category, status, published_at, updated_at,
       excerpt_zh, excerpt_en, cover_image_path, is_featured, seo_description, body_zh_path, body_en_path
     ) values (?, ?, null, ?, ?, 'published', ?, ?, ?, null, null, 0, ?, ?, null)`,
  ).run(1, "迁移测试", "migration-test", "commentary", "2026-07-21T00:00:00.000Z", "2026-07-21T00:00:00.000Z", "旧索引摘要", "迁移 SEO", "markdown/1.zh.md");
  db.prepare(
    `insert into article_search(rowid, title_zh, title_en, excerpt_zh, excerpt_en, body_zh, body_en, category, tags)
     values (1, '旧 索 引', '', '旧 摘 要', '', '旧 正 文', '', 'commentary', '')`,
  ).run();
  db.prepare("insert into tags(id, name, slug, created_at) values (1, '迁移标签', 'migration-tag', ?)")
    .run("2026-07-21T00:00:00.000Z");
  db.prepare("insert into article_tags(article_id, tag_id) values (1, 1)").run();
  db.prepare(
    `insert into publication_proofs(
       article_id, created_at, public_url, content_fingerprint, document_sha256, document_path,
       ots_path, ots_status, wayback_status
     ) values (1, ?, ?, ?, ?, ?, ?, 'complete', 'pending')`,
  ).run(
    "2026-07-21T00:00:00.000Z",
    "https://blog.leesaitool.com/commentary/migration-test",
    "legacy-fingerprint",
    "a".repeat(64),
    "proofs/1/legacy.json",
    "proofs/1/legacy.json.ots",
  );
  if (writeBody) {
    fs.mkdirSync(path.join(tmpDir, "markdown"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "markdown", "1.zh.md"), "完整正文", "utf8");
  }
  db.close();
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-migrations-"));
  process.env.DATA_DIR = tmpDir;
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("schema migrations", () => {
  it("applies and records the ordered schema once on a fresh database", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");

    migrate();
    migrate();

    expect(getDb().prepare("select version, name from schema_migrations order by version").all()).toEqual([
      { version: 1, name: "initial" },
      { version: 2, name: "rebuild_fts_shadow" },
      { version: 3, name: "article_revisions" },
      { version: 4, name: "article_url_history" },
      { version: 5, name: "ots_verification_states" },
      { version: 6, name: "durable_jobs" },
      { version: 7, name: "translation_batches" },
    ]);
    expect(getDb().prepare("select name from sqlite_master where type = 'table' and name = 'articles'").get()).toBeTruthy();
  });

  it("baselines an existing legacy schema without losing its data", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const db = getDb();
    db.exec(fs.readFileSync("tests/fixtures/legacy-schema.sql", "utf8"));
    db.prepare("insert into settings(key, value) values (?, ?)").run("site_name", "Arthur's Review");

    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    expect(db.prepare("select value from settings where key = ?").get("site_name")).toEqual({ value: "Arthur's Review" });
    expect(db.prepare("select version, name from schema_migrations order by version").all()).toEqual([
      { version: 1, name: "initial" },
      { version: 2, name: "rebuild_fts_shadow" },
      { version: 3, name: "article_revisions" },
      { version: 4, name: "article_url_history" },
      { version: 5, name: "ots_verification_states" },
      { version: 6, name: "durable_jobs" },
      { version: 7, name: "translation_batches" },
    ]);
  });

  it("rolls back a failed migration and can retry it", async () => {
    const { runMigrations } = await import("@/lib/db/migrate");
    const db = new Database(":memory:");
    const base: Migration = {
      version: 1,
      name: "base",
      filename: "001_base.sql",
      up: (database) => database.exec("create table base_value (id integer primary key)"),
    };
    const broken: Migration = {
      version: 2,
      name: "second",
      filename: "002_second.sql",
      up: (database) => {
        database.exec("create table unfinished (id integer primary key)");
        throw new Error("interrupted");
      },
    };

    expect(() => runMigrations(db, [base, broken])).toThrow("interrupted");
    expect(db.prepare("select version from schema_migrations order by version").all()).toEqual([{ version: 1 }]);
    expect(db.prepare("select name from sqlite_master where name = 'unfinished'").get()).toBeUndefined();

    runMigrations(db, [base, { ...broken, up: (database) => database.exec("create table finished (id integer primary key)") }]);
    expect(db.prepare("select version from schema_migrations order by version").all()).toEqual([{ version: 1 }, { version: 2 }]);
    expect(db.prepare("select name from sqlite_master where name = 'finished'").get()).toEqual({ name: "finished" });
    db.close();
  });

  it("rejects a migration whose filename disagrees with its version and name", async () => {
    const { runMigrations } = await import("@/lib/db/migrate");
    const db = new Database(":memory:");
    const migration: Migration = {
      version: 1,
      name: "initial",
      filename: "002_wrong.sql",
      up: () => undefined,
    };

    expect(() => runMigrations(db, [migration])).toThrow("Migration filename must be 001_initial.sql");
    db.close();
  });

  it("fills and verifies a shadow FTS table before replacing a legacy contentless index", async () => {
    createLegacyPublishedArticle();
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");
    const { getPublishedArticle } = await import("@/lib/services/articles");

    migrate();

    const db = getDb();
    const table = db.prepare("select sql from sqlite_master where name = 'article_search'").get() as { sql: string };
    expect(table.sql).not.toContain("content=''");
    expect(db.prepare("select rowid from article_search order by rowid").all()).toEqual([{ rowid: 1 }]);
    expect(db.prepare("select rowid from article_search where article_search match ?").all('"正"')).toEqual([{ rowid: 1 }]);
    const articleColumns = db.pragma("table_info(articles)") as Array<{ name: string }>;
    expect(articleColumns.map((column) => column.name)).toEqual([
      "id",
      "draft_revision_id",
      "published_revision_id",
      "published_at",
      "updated_at",
      "is_featured",
    ]);
    expect(getPublishedArticle("commentary", "migration-test")).toMatchObject({
      titleZh: "迁移测试",
      bodyZh: "完整正文",
      tags: [{ id: 1, name: "迁移标签", slug: "migration-tag" }],
    });
    expect(db.prepare("select ots_status from publication_proofs where id = 1").get()).toEqual({
      ots_status: "pending_confirmation",
    });
    expect(db.prepare("select article_revision_id from publication_proofs where id = 1").get()).toEqual({
      article_revision_id: 1,
    });
  });

  it("keeps the old FTS table if rebuilding is interrupted before the swap", async () => {
    createLegacyPublishedArticle();
    const { closeDb, getDb } = await import("@/lib/db/connection");
    closeDb();
    const db = getDb();
    const { rebuildArticleSearchWithShadow } = await import("@/lib/db/migrate");
    const rebuild = db.transaction(() =>
      rebuildArticleSearchWithShadow(db, () => {
        throw new Error("interrupted before swap");
      }),
    );

    expect(() => rebuild.immediate()).toThrow("interrupted before swap");
    expect((db.prepare("select sql from sqlite_master where name = 'article_search'").get() as { sql: string }).sql).toContain("content='' ".trim());
    expect(db.prepare("select rowid from article_search order by rowid").all()).toEqual([{ rowid: 1 }]);
    expect(db.prepare("select name from sqlite_master where name = 'article_search_shadow'").get()).toBeUndefined();
  });

  it("refuses to replace the old FTS index when a Markdown body is missing", async () => {
    createLegacyPublishedArticle({ writeBody: false });
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");

    expect(() => migrate()).toThrow("Missing Markdown body file: markdown/1.zh.md");

    const db = getDb();
    expect(db.prepare("select version from schema_migrations order by version").all()).toEqual([{ version: 1 }]);
    expect(db.prepare("select rowid from article_search order by rowid").all()).toEqual([{ rowid: 1 }]);
    expect(db.prepare("select name from sqlite_master where name = 'article_search_shadow'").get()).toBeUndefined();
  });
});
