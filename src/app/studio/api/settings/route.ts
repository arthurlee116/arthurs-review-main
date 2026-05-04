import { z } from "zod";
import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { getSettings, setSetting } from "@/lib/services/settings";
import { clearFeaturedArticle, getArticleById, setFeaturedArticle } from "@/lib/services/articles";

const SettingsSchema = z.object({
  siteName: z.string().min(1),
  contactEmail: z.string().email(),
  about: z.string(),
  featuredArticleId: z.string(),
  rssDescription: z.string(),
});

export async function GET(request: Request) {
  const unauthorized = await requireApiAdmin(request, { csrf: false });
  if (unauthorized) return unauthorized;
  return Response.json({ settings: getSettings() });
}

export async function PUT(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const input = SettingsSchema.parse(await request.json());
    const featuredId = input.featuredArticleId.trim();
    if (featuredId) {
      const id = Number(featuredId);
      const article = Number.isInteger(id) ? getArticleById(id, { includeDraft: true }) : null;
      if (!article || article.status !== "published") {
        return Response.json({ error: "Featured article must be published." }, { status: 400 });
      }
    }
    for (const [key, value] of Object.entries({ ...input, featuredArticleId: featuredId })) {
      setSetting(key as keyof typeof input, value);
    }
    if (featuredId) {
      setFeaturedArticle(Number(featuredId));
    } else {
      clearFeaturedArticle();
    }
    return Response.json({ settings: getSettings() });
  } catch (error) {
    return apiError(error);
  }
}
