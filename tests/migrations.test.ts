import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Migration } from "@/lib/db/migrate";

let tmpDir: string;

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

    expect(getDb().prepare("select version, name from schema_migrations order by version").all()).toEqual([{ version: 1, name: "initial" }]);
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
    expect(db.prepare("select version, name from schema_migrations").all()).toEqual([{ version: 1, name: "initial" }]);
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
});
