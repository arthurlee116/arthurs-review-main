import fs from "node:fs";
import { connection } from "next/server";

import { getDb } from "@/lib/db/connection";
import { ensureDataDirectories } from "@/lib/env";

export async function GET() {
  await connection();
  let database: "ok" | "failed" = "failed";
  let storage: "ok" | "failed" = "failed";

  try {
    const row = getDb()
      .prepare("select count(*) as published from articles where status = 'published'")
      .get() as { published: number } | undefined;
    if (typeof row?.published === "number") database = "ok";
  } catch (error) {
    console.error("Health check database probe failed", error);
  }

  try {
    const paths = ensureDataDirectories();
    for (const directory of [paths.root, paths.markdownDir, paths.uploadsDir, paths.proofsDir]) {
      fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
    }
    storage = "ok";
  } catch (error) {
    console.error("Health check storage probe failed", error);
  }

  const ok = database === "ok" && storage === "ok";
  return Response.json({ ok, checks: { database, storage } }, { status: ok ? 200 : 503 });
}
