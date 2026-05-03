import { z } from "zod";
import { requireApiAdmin } from "@/app/studio/api/_helpers";
import { getSettings, setSetting } from "@/lib/services/settings";
import { setFeaturedArticle } from "@/lib/services/articles";

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
  const input = SettingsSchema.parse(await request.json());
  for (const [key, value] of Object.entries(input)) {
    setSetting(key as keyof typeof input, value);
  }
  if (input.featuredArticleId) setFeaturedArticle(Number(input.featuredArticleId));
  return Response.json({ settings: getSettings() });
}
