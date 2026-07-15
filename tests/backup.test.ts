import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("database backups", () => {
  it("exposes an online SQLite backup function", async () => {
    expect(fs.existsSync("src/lib/db/backup.ts")).toBe(true);
  });

  it("backs up an open WAL database and verifies the snapshot", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-backup-"));
    const sourcePath = path.join(tmpDir, "source.sqlite3");
    const destinationPath = path.join(tmpDir, "snapshot.sqlite3");
    const source = new Database(sourcePath);

    try {
      source.pragma("journal_mode = WAL");
      source.exec("create table notes (id integer primary key, body text not null)");
      source.prepare("insert into notes (body) values (?)").run("still in a live WAL database");

      const { backupSqliteDatabase } = await import("@/lib/db/backup");
      const result = await backupSqliteDatabase(sourcePath, destinationPath);
      const snapshot = new Database(destinationPath, { readonly: true });

      try {
        expect(result).toEqual({ integrity: "ok", destinationPath });
        expect(snapshot.prepare("select body from notes").pluck().get()).toBe("still in a live WAL database");
        expect(snapshot.pragma("integrity_check", { simple: true })).toBe("ok");
      } finally {
        snapshot.close();
      }
    } finally {
      source.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
