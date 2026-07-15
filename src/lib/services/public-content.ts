"use cache";

import { cacheLife, cacheTag } from "next/cache";
import type { CategoryId } from "@/lib/content/categories";
import { getPublishedArticle, listPublishedArticles } from "@/lib/services/articles";
import { PUBLIC_CONTENT_TAG } from "@/lib/services/public-cache";
import { listPublicPublicationProofs } from "@/lib/services/publication-proofs";
import { getSetting, getSettings, type SettingKey } from "@/lib/services/settings";

export async function listCachedPublishedArticles(category?: CategoryId) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listPublishedArticles(category);
}

export async function getCachedPublishedArticle(category: CategoryId, slug: string) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getPublishedArticle(category, slug);
}

export async function getCachedSettings() {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getSettings();
}

export async function getCachedSetting(key: SettingKey) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getSetting(key);
}

export async function listCachedPublicPublicationProofs() {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listPublicPublicationProofs();
}
