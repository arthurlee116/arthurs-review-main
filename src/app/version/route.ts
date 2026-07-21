import { connection } from "next/server";

import { getDb } from "@/lib/db/connection";
import { getReleaseMetadata } from "@/lib/env";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  try {
    const row = getDb().prepare("select max(version) as version from schema_migrations").get() as { version: number | null };
    if (!Number.isInteger(row.version)) throw new Error("Schema version is unavailable.");
    const { commit, digest } = getReleaseMetadata();
    return Response.json({ commit, digest, schemaVersion: row.version }, { headers });
  } catch (error) {
    console.error("Version metadata probe failed", error);
    return Response.json({ error: "Version metadata unavailable" }, { status: 503, headers });
  }
}
