import { z } from "zod";
import { csrfCookie, sessionCookie } from "@/lib/auth/constants";
import { verifyCsrfToken } from "@/lib/auth/csrf";
import { verifySessionCookie } from "@/lib/auth/session";
import { categoryIds } from "@/lib/content/categories";
import { slugPattern } from "@/lib/content/slugs";
import { NotFoundError } from "@/lib/errors";

export const ArticleBodySchema = z.object({
  titleZh: z.string().min(1, "Chinese title is required"),
  titleEn: z.string().nullable(),
  slug: z.string().regex(slugPattern, "Slug must use lowercase letters, numbers, and single hyphens"),
  category: z.enum(categoryIds),
  excerptZh: z.string(),
  excerptEn: z.string().nullable(),
  seoDescription: z.string(),
  bodyZh: z.string().min(1, "Chinese body is required"),
  bodyEn: z.string().nullable(),
  tagIds: z.array(z.number().int().positive()),
  coverImagePath: z.string().nullable(),
});

export const ArticleUpdateBodySchema = ArticleBodySchema.extend({
  expectedDraftRevisionId: z.number().int().positive(),
});

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function requireApiAdmin(request: Request, { csrf = true } = {}) {
  // Read from the cookie header directly: handlers are typed as receiving a plain
  // Request, and tests (and non-Next callers) pass exactly that.
  const session = cookieValue(request, sessionCookie);
  if (!(await verifySessionCookie(session))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (csrf && request.method !== "GET") {
    const expected = cookieValue(request, csrfCookie);
    const received = request.headers.get("x-csrf-token") ?? undefined;
    if (!verifyCsrfToken(expected, received)) {
      return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
    }
  }

  return null;
}

export function apiError(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    const detail = [field, issue?.message].filter(Boolean).join(": ");
    return Response.json({ error: detail ? `Invalid request body: ${detail}` : "Invalid request body" }, { status: 400 });
  }
  if (typeof error === "object" && error && "code" in error && String((error as { code?: unknown }).code).startsWith("SQLITE_CONSTRAINT")) {
    return Response.json({ error: "A record with those unique fields already exists." }, { status: 409 });
  }
  if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === "ARTICLE_REVISION_CONFLICT") {
    return Response.json({ error: error instanceof Error ? error.message : "Draft revision conflict." }, { status: 409 });
  }
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}
