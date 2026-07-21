import { migrate } from "@/lib/db/migrate";
import { getDb } from "@/lib/db/connection";
import { createArticle, listStudioArticles, publishArticle, setFeaturedArticle } from "@/lib/services/articles";
import { createTag, listTags } from "@/lib/services/tags";

function ensureTag(name: string) {
  const existing = listTags().find((tag) => tag.name === name);
  return existing ?? createTag(name);
}

function articleExists(slug: string) {
  return listStudioArticles().some((article) => article.slug === slug);
}

export function seed() {
  migrate();
  const cityTag = ensureTag("城市");
  const notesTag = ensureTag("短评");

  if (!articleExists("city-bystander")) {
    const featured = createArticle({
      titleZh: "一座城市如何把人训练成旁观者",
      titleEn: "How a City Trains People Into Bystanders",
      slug: "city-bystander",
      category: "society",
      excerptZh: "城市不只容纳孤独，也会训练一种礼貌的旁观。",
      excerptEn: "Cities do not merely contain loneliness; they train polite distance.",
      seoDescription: "Arthur's Review on cities, distance, and bystander habits.",
      bodyZh: "城市最厉害的地方，不是把人变得冷漠，而是把冷漠包装成分寸。\n\n地铁里没有人真的缺少同情心。大家只是太清楚，一旦伸手，生活就会露出它没有边界的一面。",
      bodyEn:
        "The sharpest trick of a city is not making people cruel. It teaches them to call distance good manners.\n\nOn the subway, sympathy is rarely absent. People simply know that once they reach out, life may stop having edges.",
      tagIds: [cityTag.id],
      coverImagePath: null,
    });
    publishArticle(featured.id);
    setFeaturedArticle(featured.id);
  }

  if (!articleExists("short-note")) {
    const note = createArticle({
      titleZh: "短评的锋利应该留一点余温",
      titleEn: null,
      slug: "short-note",
      category: "commentary",
      excerptZh: "观点可以锋利，但不必把人削成靶子。",
      excerptEn: null,
      seoDescription: "A short Arthur's Review note on opinion writing.",
      bodyZh: "短评最差的样子，是把判断写成锤子，见什么都敲。\n\n真正有力的判断，应该能让人觉得被指出问题，而不是被羞辱。",
      bodyEn: null,
      tagIds: [notesTag.id],
      coverImagePath: null,
    });
    publishArticle(note.id);
  }

  if (!articleExists("night-lines")) {
    const poem = createArticle({
      titleZh: "夜里写下的几行诗",
      titleEn: null,
      slug: "night-lines",
      category: "misc",
      excerptZh: "夜色不是答案，只是让问题慢下来。",
      excerptEn: null,
      seoDescription: "A short poem from Arthur's Review.",
      bodyZh: "夜里，城市把声音交还给窗。\n\n我把没说出口的话，折成一小块光。",
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    });
    publishArticle(poem.id);
  }

  if (!articleExists("draft-only")) {
    createArticle({
      titleZh: "一篇还不该出现的草稿",
      titleEn: null,
      slug: "draft-only",
      category: "misc",
      excerptZh: "这篇应该只存在于后台。",
      excerptEn: null,
      seoDescription: "Draft only.",
      bodyZh: "草稿正文。",
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    });
  }

  if (process.env.E2E_LISTING_FIXTURES === "1") {
    for (let index = 1; index <= 13; index += 1) {
      const slug = `e2e-list-limit-${index}`;
      if (!articleExists(slug)) {
        const article = createArticle({
          titleZh: `E2E 上限文章 ${index}`,
          titleEn: null,
          slug,
          category: "commentary",
          excerptZh: "只用于验证公开列表上限。",
          excerptEn: null,
          seoDescription: "Playwright listing limit fixture.",
          bodyZh: `这是第 ${index} 篇列表上限测试文章。`,
          bodyEn: null,
          tagIds: [],
          coverImagePath: null,
        });
        publishArticle(article.id);
      }

      const timestamp = `2024-01-${String(14 - index).padStart(2, "0")}T00:00:00.000Z`;
      getDb()
        .prepare(
          `update articles set published_at = ?, updated_at = ?
           where id = (
             select articles.id
             from articles
             join article_revisions on article_revisions.id = articles.draft_revision_id
             where article_revisions.slug = ?
           )`,
        )
        .run(timestamp, timestamp, slug);
    }
  }
}
