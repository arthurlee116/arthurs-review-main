"use cache";

import { cacheLife, cacheTag } from "next/cache";
import type { CategoryId } from "@/lib/content/categories";
import { countLifeMedia } from "@/lib/content/life-body";
import { readMarkdownBody } from "@/lib/content/markdown";
import {
  getPublishedArticle,
  getArticleUrlRedirect,
  listPublishedArticlePage,
  listPublishedArticles,
  type PublishedArticleListOptions,
} from "@/lib/services/articles";
import {
  PUBLIC_ARTICLE_LIST_TAG,
  PUBLIC_PROOFS_TAG,
  PUBLIC_SETTINGS_TAG,
  publicArticleProofsTag,
  publicArticleTag,
} from "@/lib/services/public-cache";
import { listPublicationProofs, listPublicPublicationProofPage } from "@/lib/services/publication-proofs";
import { getSetting, getSettings, type SettingKey } from "@/lib/services/settings";

export async function listCachedPublishedArticles(category?: CategoryId, options?: PublishedArticleListOptions) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_ARTICLE_LIST_TAG);
  return listPublishedArticles(category, options);
}

export async function listCachedPublishedArticlePage(page: number, pageSize = 50) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_ARTICLE_LIST_TAG);
  return listPublishedArticlePage({ page, pageSize });
}

export async function getCachedPublishedArticle(category: CategoryId, slug: string) {
  cacheLife("publicContent");
  cacheTag(publicArticleTag(category, slug));
  return getPublishedArticle(category, slug);
}

export async function getCachedArticleUrlRedirect(category: CategoryId, slug: string) {
  cacheLife("publicContent");
  cacheTag(publicArticleTag(category, slug));
  return getArticleUrlRedirect(category, slug);
}

export async function getCachedSettings() {
  cacheLife("publicContent");
  cacheTag(PUBLIC_SETTINGS_TAG);
  return getSettings();
}

export async function getCachedSetting(key: SettingKey) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_SETTINGS_TAG);
  return getSetting(key);
}

export async function listCachedPublicPublicationProofPage(page: number, pageSize = 50) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_PROOFS_TAG);
  return listPublicPublicationProofPage({ page, pageSize });
}

export async function listCachedPublicationProofs(articleId: number) {
  cacheLife("publicContent");
  cacheTag(publicArticleProofsTag(articleId));
  return listPublicationProofs(articleId);
}

// Media counts derive from on-disk markdown bodies; caching them with the article
// list keeps the life archive from re-reading every body file on each request.
export async function getCachedLifeListing(limit = 50) {
  cacheLife("publicContent");
  cacheTag(PUBLIC_ARTICLE_LIST_TAG);
  const articles = listPublishedArticles("life", { limit });
  const mediaCounts = Object.fromEntries(
    articles
      .map((article) => {
        try {
          return [article.id, countLifeMedia(readMarkdownBody(article.bodyZhPath))] as const;
        } catch {
          return [article.id, 0] as const;
        }
      })
      .filter(([, count]) => count > 1),
  );
  return { articles, mediaCounts };
}
