"use cache";

import { cacheLife, cacheTag } from "next/cache";
import type { CategoryId } from "@/lib/content/categories";
import {
  getPublishedArticle,
  getArticleUrlRedirect,
  listPublishedArticles,
  type PublishedArticleListOptions,
} from "@/lib/services/articles";
import { PUBLIC_CONTENT_TAG } from "@/lib/services/public-cache";
import { listPublicationProofs, listPublicPublicationProofs } from "@/lib/services/publication-proofs";
import { getSetting, getSettings, type SettingKey } from "@/lib/services/settings";

export async function listCachedPublishedArticles(category?: CategoryId, options?: PublishedArticleListOptions) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listPublishedArticles(category, options);
}

export async function getCachedPublishedArticle(category: CategoryId, slug: string) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getPublishedArticle(category, slug);
}

export async function getCachedArticleUrlRedirect(category: CategoryId, slug: string) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getArticleUrlRedirect(category, slug);
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

export async function listCachedPublicationProofs(articleId: number) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listPublicationProofs(articleId);
}
