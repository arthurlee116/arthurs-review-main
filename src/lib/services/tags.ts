import { normalizeSlug } from "@/lib/content/slugs";
import { getDb } from "@/lib/db/connection";

export function listTags() {
  return getDb().prepare("select id, name, slug from tags order by name").all() as Array<{ id: number; name: string; slug: string }>;
}

export function createTag(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error("Tag name is required.");
  const slug = normalizeSlug(trimmed) || encodeURIComponent(trimmed);
  const result = getDb()
    .prepare("insert into tags (name, slug, created_at) values (?, ?, ?)")
    .run(trimmed, slug, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), name: trimmed, slug };
}
