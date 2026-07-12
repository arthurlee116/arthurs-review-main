import { connection } from "next/server";
import { SettingsForm } from "@/components/studio/SettingsForm";
import { listPublishedArticles } from "@/lib/services/articles";
import { getSettings } from "@/lib/services/settings";

export default async function SettingsPage() {
  await connection();
  return <SettingsForm initialSettings={getSettings()} publishedArticles={listPublishedArticles()} />;
}
