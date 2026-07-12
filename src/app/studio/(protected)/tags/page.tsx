import { TagsManager } from "@/components/studio/TagsManager";
import { listTags } from "@/lib/services/tags";

export default function TagsPage() {
  return <TagsManager initialTags={listTags()} />;
}
