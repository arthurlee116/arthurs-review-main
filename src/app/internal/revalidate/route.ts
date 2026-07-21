import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { invalidateCacheTags } from "@/lib/services/public-cache";

const BodySchema = z.object({
  tags: z.array(z.string().startsWith("public:").max(256)).max(128),
});

function authorized(request: Request) {
  const expected = process.env.WORKER_REVALIDATE_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const actual = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { tags } = BodySchema.parse(await request.json());
    invalidateCacheTags(tags);
    return Response.json({ revalidated: [...new Set(tags)].length });
  } catch {
    return Response.json({ error: "Invalid cache tags" }, { status: 400 });
  }
}
