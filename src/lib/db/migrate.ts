import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection";

export function migrate() {
  const db = getDb();
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const schema = fs.readFileSync(path.join(dirname, "schema.sql"), "utf8");
  db.exec(schema);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate();
}
