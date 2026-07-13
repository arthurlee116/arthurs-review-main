"use cache";

import { cacheLife, cacheTag } from "next/cache";
import type { CategoryId } from "@/lib/content/categories";
import { getPublishedArticle, listPublishedArticles } from "@/lib/services/articles";
import { getSetting, getSettings, type SettingKey } from "@/lib/services/settings";

export async function listCachedPublishedArticles(category?: CategoryId) {
  cacheLife("publicContent");
  cacheTag("public-content");
  return listPublishedArticles(category);
}

export async function getCachedPublishedArticle(category: CategoryId, slug: string) {
  cacheLife("publicContent");
  cacheTag("public-content");
  return getPublishedArticle(category, slug);
}

export async function getCachedSettings() {
  cacheLife("publicContent");
  cacheTag("public-content");
  return getSettings();
}

export async function getCachedSetting(key: SettingKey) {
  cacheLife("publicContent");
  cacheTag("public-content");
  return getSetting(key);
}
