import { z } from "zod";
import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { getDb } from "@/lib/db/connection";
import { getSettings, setSetting } from "@/lib/services/settings";

const SettingsSchema = z.object({
  siteName: z.string().min(1),
  contactEmail: z.string().email(),
  about: z.string(),
  rssDescription: z.string(),
  openrouterTranslationModel: z.string().min(1),
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
    getDb().transaction(() => {
      for (const [key, value] of Object.entries(input)) {
        setSetting(key as keyof typeof input, value);
      }
    }).immediate();
    return Response.json({ settings: getSettings() });
  } catch (error) {
    return apiError(error);
  }
}
