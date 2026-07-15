import path from "node:path";
import { backupSqliteDatabase } from "../src/lib/db/backup";
import { getDataPaths } from "../src/lib/env";

const destinationPath = process.argv[2];
if (!destinationPath) throw new Error("Usage: backup-database.ts <destination.sqlite3>");

const sourcePath = getDataPaths().dbPath;
if (path.resolve(sourcePath) === path.resolve(destinationPath)) throw new Error("Backup destination must differ from the live database.");

const result = await backupSqliteDatabase(sourcePath, destinationPath);
process.stdout.write(`${JSON.stringify(result)}\n`);
