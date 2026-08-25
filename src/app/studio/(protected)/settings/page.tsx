import { connection } from "next/server";
import { SettingsForm } from "@/components/studio/SettingsForm";
import { listPublishedArticleOptions } from "@/lib/services/articles";
import { getSettings } from "@/lib/services/settings";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  return <SettingsForm initialSettings={getSettings()} publishedArticles={listPublishedArticleOptions()} />;
}
