import { connection } from "next/server";
import { TagsManager } from "@/components/studio/TagsManager";
import { listTags } from "@/lib/services/tags";

export const instant = false;

export default async function TagsPage() {
  await connection();
  return <TagsManager initialTags={listTags()} />;
}
