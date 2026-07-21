import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function createBackupFixture(root: string, { corruptManifest = false } = {}) {
  const staging = path.join(root, "staging");
  const archive = path.join(root, corruptManifest ? "corrupt.tar.gz" : "valid.tar.gz");
  fs.mkdirSync(staging, { recursive: true });
  for (const directory of ["markdown", "uploads", "proofs"]) {
    fs.mkdirSync(path.join(staging, directory));
  }

  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = staging;
  const database = new Database(path.join(staging, "arthurs-review.sqlite3"));
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    runMigrations(database);
  } finally {
    database.close();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  }

  const checksum = await execFileAsync("sha256sum", ["arthurs-review.sqlite3"], { cwd: staging });
  fs.writeFileSync(
    path.join(staging, "MANIFEST.sha256"),
    corruptManifest ? checksum.stdout.replace(/^[a-f0-9]/, (value) => (value === "0" ? "1" : "0")) : checksum.stdout,
  );
  await execFileAsync(
    "tar",
    ["-czf", archive, "arthurs-review.sqlite3", "markdown", "uploads", "proofs", "MANIFEST.sha256"],
    { cwd: staging },
  );
  return archive;
}

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

  it("runs the production backup CLI against an open WAL database", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-backup-cli-"));
    const sourcePath = path.join(tmpDir, "arthurs-review.sqlite3");
    const destinationPath = path.join(tmpDir, "snapshot.sqlite3");
    const source = new Database(sourcePath);

    try {
      source.pragma("journal_mode = WAL");
      source.exec("create table notes (id integer primary key, body text not null)");
      source.prepare("insert into notes (body) values (?)").run("created by the CLI drill");

      const result = await execFileAsync("pnpm", ["exec", "tsx", "scripts/backup-database.ts", destinationPath], {
        cwd: process.cwd(),
        env: { ...process.env, DATA_DIR: tmpDir },
      });
      const snapshot = new Database(destinationPath, { readonly: true });

      try {
        expect(JSON.parse(result.stdout)).toMatchObject({ integrity: "ok", destinationPath });
        expect(snapshot.prepare("select body from notes").pluck().get()).toBe("created by the CLI drill");
      } finally {
        snapshot.close();
      }
    } finally {
      source.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("restores a verified archive into an isolated directory and migrates the copy", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-restore-"));
    const target = path.join(tmpDir, "restored");

    try {
      const archive = await createBackupFixture(tmpDir);
      await execFileAsync("bash", ["scripts/restore-backup.sh", archive, "--target", target], {
        cwd: process.cwd(),
        env: { ...process.env, MAINTENANCE_LOCK_HELD: "1" },
      });

      const restored = new Database(path.join(target, "arthurs-review.sqlite3"), { readonly: true });
      try {
        expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
        expect(restored.prepare("select max(version) from schema_migrations").pluck().get()).toBe(8);
      } finally {
        restored.close();
      }
      expect(fs.existsSync(path.join(target, "markdown"))).toBe(true);
      expect(fs.existsSync(path.join(target, "uploads"))).toBe(true);
      expect(fs.existsSync(path.join(target, "proofs"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects an archive whose manifest does not match", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-restore-corrupt-"));

    try {
      const archive = await createBackupFixture(tmpDir, { corruptManifest: true });
      await expect(
        execFileAsync("bash", ["scripts/restore-backup.sh", archive, "--target", path.join(tmpDir, "restored")], {
          cwd: process.cwd(),
          env: { ...process.env, MAINTENANCE_LOCK_HELD: "1" },
        }),
      ).rejects.toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to extract a backup into the production data directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-restore-production-"));
    const productionDir = path.join(tmpDir, "production-data");

    try {
      const archive = await createBackupFixture(tmpDir);
      await expect(
        execFileAsync("bash", ["scripts/restore-backup.sh", archive, "--target", productionDir], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MAINTENANCE_LOCK_HELD: "1",
            PRODUCTION_DATA_DIR: productionDir,
          },
        }),
      ).rejects.toThrow();
      expect(fs.readdirSync(productionDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
