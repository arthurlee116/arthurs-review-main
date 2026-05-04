import { SettingsForm } from "@/components/studio/SettingsForm";
import { listPublishedArticles } from "@/lib/services/articles";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsForm initialSettings={getSettings()} publishedArticles={listPublishedArticles()} />;
}
