import { TagsManager } from "@/components/studio/TagsManager";
import { listTags } from "@/lib/services/tags";

export const dynamic = "force-dynamic";

export default function TagsPage() {
  return <TagsManager initialTags={listTags()} />;
}
