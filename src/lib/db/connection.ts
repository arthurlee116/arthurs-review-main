import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureDataDirectories, getDataPaths } from "@/lib/env";

let db: Database.Database | undefined;
let activePath: string | undefined;

export function getDb() {
  ensureDataDirectories();
  const { dbPath } = getDataPaths();
  if (db && activePath === dbPath) return db;
  closeDb();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  activePath = dbPath;
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = undefined;
  activePath = undefined;
}
