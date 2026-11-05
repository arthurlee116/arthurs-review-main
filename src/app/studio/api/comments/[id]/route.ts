import { z } from "zod";
import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { commentCacheTags, commentStatuses, deleteComment, setCommentStatus } from "@/lib/services/comments";
import { invalidateCacheTags } from "@/lib/services/public-cache";

type Context = { params: Promise<{ id: string }> };

async function commentId(context: Context) {
  const id = Number((await context.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: Context) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const id = await commentId(context);
    if (!id) return Response.json({ error: "Invalid comment id." }, { status: 400 });
    const { status } = z.object({ status: z.enum(commentStatuses) }).parse(await request.json());
    const { articleId } = setCommentStatus(id, status);
    invalidateCacheTags(commentCacheTags(articleId));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const id = await commentId(context);
    if (!id) return Response.json({ error: "Invalid comment id." }, { status: 400 });
    const { articleId } = deleteComment(id);
    invalidateCacheTags(commentCacheTags(articleId));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
