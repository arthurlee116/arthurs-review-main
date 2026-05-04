import { z } from "zod";
import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { createTag, listTags } from "@/lib/services/tags";

export async function GET(request: Request) {
  const unauthorized = await requireApiAdmin(request, { csrf: false });
  if (unauthorized) return unauthorized;
  return Response.json({ tags: listTags() });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { name } = z.object({ name: z.string().min(1) }).parse(await request.json());
    return Response.json({ tag: createTag(name) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
