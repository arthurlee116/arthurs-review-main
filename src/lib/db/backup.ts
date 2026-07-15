import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export async function backupSqliteDatabase(sourcePath: string, destinationPath: string) {
  const destinationDir = path.dirname(destinationPath);
  const temporaryPath = path.join(destinationDir, `.${path.basename(destinationPath)}.${process.pid}.${randomUUID()}.tmp`);
  fs.mkdirSync(destinationDir, { recursive: true });
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });

  try {
    await source.backup(temporaryPath);
    const snapshot = new Database(temporaryPath, { readonly: true, fileMustExist: true });
    let integrity: unknown;
    try {
      integrity = snapshot.pragma("integrity_check", { simple: true });
    } finally {
      snapshot.close();
    }
    if (integrity !== "ok") throw new Error(`SQLite backup integrity check failed: ${String(integrity)}`);
    fs.renameSync(temporaryPath, destinationPath);
    const directory = fs.openSync(destinationDir, "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
    return { integrity: "ok" as const, destinationPath };
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  } finally {
    source.close();
  }
}
