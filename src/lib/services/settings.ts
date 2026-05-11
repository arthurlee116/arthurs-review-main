import { getDb } from "@/lib/db/connection";

const defaults = {
  siteName: "Arthur's Review",
  contactEmail: "laoliarthur@outlook.com",
  about:
    "Arthur's Review is a personal publication for current-affairs notes, social analysis, poems, travel writing, and other things worth keeping.",
  featuredArticleId: "",
  rssDescription: "Arthur's Review, a personal intellectual publication.",
  openrouterTranslationModel: "inclusionai/ring-2.6-1t:free",
};

export type SettingKey = keyof typeof defaults;

export function getSetting(key: SettingKey) {
  const row = getDb().prepare("select value from settings where key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? defaults[key];
}

export function setSetting(key: SettingKey, value: string) {
  getDb()
    .prepare("insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value")
    .run(key, value);
}

export function getSettings() {
  return Object.fromEntries((Object.keys(defaults) as SettingKey[]).map((key) => [key, getSetting(key)])) as Record<SettingKey, string>;
}
